# MachineMandi Backend & Relayer Service (Member 3)

The MachineMandi backend is an off-chain relayer service bridging physical IoT hardware and the MST Blockchain smart contract:
1. Listens for on-chain `JobCreated` events and enqueues jobs in `WAITING` state.
2. Receives device-key-signed work proofs from physical IoT devices via HTTP.
3. Validates proof schemas, timing constraints, and moisture readings.
4. Enforces idempotency against duplicate proofs.
5. Performs local pre-flight checks and cryptographic **EIP-712 signature verification** before spending gas.
6. Relays proofs on-chain to `MachineMandi.submitProof(...)` via a dedicated relayer wallet.

---

## 1. Architecture Overview (M3.4)

```
                       ┌───────────────────────────────┐
                       │     MachineMandi Contract     │
                       │   (MST Testnet - 91562037)    │
                       └───────────────┬───────────────┘
                                       │
                         JobCreated    │  submitProof()
                            Event      │  (Relayer Wallet)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND / RELAYER SERVICE (Member 3)                                        │
│                                                                             │
│  ┌───────────────────────┐                                                  │
│  │  JobCreated Listener   │                                                  │
│  │ (listener.ts)         │                                                  │
│  └───────────┬───────────┘                                                  │
│              │ Ingest event into queue with on-chain nonce                  │
│              ▼                                                              │
│  ┌───────────────────────┐       POST /api/device/proof                     │
│  │   In-Memory JobQueue  │ <────────────────────────── [Physical IoT Device] │
│  │ (jobQueue.ts)         │                              (Signs with own key)│
│  └───────────┬───────────┘                                                  │
│              │                                                              │
│              │ State: WAITING → PROCESSING → PROOF_RECEIVED → SUBMITTING    │
│              ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Blockchain Adapter Layer (BlockchainService)                         │  │
│  │                                                                       │  │
│  │  ├── [Mock Adapter: Default, in-memory ledger, keccak256 tx hash]     │  │
│  │  └── [Live MST Adapter (mstContract.ts):                             │  │
│  │        - EIP-712 Typed Data Verification (ethers.verifyTypedData)     │  │
│  │        - On-Chain Status, Nonce & Delta Validation                    │  │
│  │        - Contract submitProof() broadcast via Relayer Wallet          │  │
│  │        - Receipt settlement (tx.wait())]                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Result: SUBMITTED (200 OK + txHash) | FAILED (502 Bad Gateway)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Strict Security Rules & Trust Invariant

> [!CAUTION]
> **CRITICAL SECURITY RULES FOR BACKEND / RELAYER:**
> 1. The Backend **NEVER** holds, generates, requests, or stores physical device private keys.
> 2. The Physical Machine microcontroller signs the `WorkProof` data structure locally using its own embedded private key.
> 3. The Backend Relayer uses its own separate wallet (`RELAYER_PRIVATE_KEY`) **exclusively to pay gas fees**.
> 4. The Relayer **NEVER** substitutes its own address as the device signer. The smart contract recovers the hardware address using `ECDSA.recover` and will revert with `InvalidSigner()` if it does not match the node's registered `signer`.

---

## 3. Blockchain Adapter Architecture

The backend interacts with the blockchain through the `BlockchainService` interface:

```typescript
export interface BlockchainService {
  readonly mode: 'mock' | 'live';
  submitProof(proof: DeviceProof): Promise<{ txHash: string }>;
  getJob(jobId: number): Promise<OnChainJob | any>;
  startJobListener(callback: (event: JobCreatedEvent) => void | Promise<void>): Promise<void> | void;
  stopJobListener(): Promise<void> | void;
}
```

### Adapter Modes

1. **`MockBlockchainService` (`src/blockchain/contract.ts`) [Default]**:
   - Enabled when `BLOCKCHAIN_ADAPTER_MODE=mock`.
   - Generates deterministic 32-byte EVM transaction hashes using `ethers.keccak256`.
   - Provides failure injection hooks (`simulateFailures`) for testing retry policies and timeout recovery.
   - Allows complete, isolated unit testing without spending live testnet gas.

2. **`MstBlockchainService` (`src/blockchain/mstContract.ts`) [Live Mode]**:
   - Enabled when `BLOCKCHAIN_ADAPTER_MODE=live`.
   - Connects to MST Testnet via `ethers.JsonRpcProvider`.
   - Validates that connected network Chain ID is `91562037`.
   - Pre-flight checks on-chain job status, reading delta, timestamps, and 65-byte signature format.
   - Verifies the EIP-712 signature locally before broadcasting.
   - Broadcasts `submitProof(...)` and waits for receipt confirmation.

---

## 4. EIP-712 Cryptographic Signature Specification

### Domain Configuration
```typescript
const domain = {
  name: "MachineMandi",
  version: "1",
  chainId: 91562037n,
  verifyingContract: "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE",
};
```

### WorkProof Types
```typescript
const types = {
  WorkProof: [
    { name: "jobId", type: "uint256" },
    { name: "nodeId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "startedAt", type: "uint256" },
    { name: "completedAt", type: "uint256" },
    { name: "preReading", type: "uint256" },
    { name: "postReading", type: "uint256" },
    { name: "serviceHash", type: "bytes32" },
  ],
};
```

### Typehash
`keccak256("WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)")`  
`= 0x48ae153724c885fa2d97c36a4aa44bca1fcf7dfdf46296c00ffcfa6c4cb72e70`

---

## 5. Pre-Flight Validation Rules (Live Mode)

Before broadcasting `submitProof(...)` on MST Testnet, the relayer verifies:
1. `job.status === 0` (Job is `STATUS_OPEN`).
2. `proof.nodeId === job.nodeId`.
3. `proof.nonce === job.nonce`.
4. `proof.serviceHash.toLowerCase() === job.serviceHash.toLowerCase()`.
5. `completedAt >= startedAt` and `completedAt <= job.deadline`.
6. `postReading > preReading` and `postReading - preReading >= job.minDelta`.
7. `signature` is exactly 65 bytes (132 characters hex string starting with `0x`).
8. `ethers.verifyTypedData(domain, types, values, proof.signature).toLowerCase() === job.signer.toLowerCase()`.

---

## 6. API Endpoints

### `GET /health`
Returns service readiness, adapter mode, listener status, and network details.
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "uptime": 240.1,
  "timestamp": "2026-09-29T03:30:00.000Z",
  "blockchainAdapter": "mock",
  "listenerStatus": "running",
  "relayerConfigured": false,
  "chainId": 91562037,
  "contractAddress": "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE",
  "rpcConnected": true
}
```

### `POST /api/device/proof`
Receives and relays a physical device work proof.
- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "jobId": 42,
  "nodeId": 1,
  "nonce": 42,
  "startedAt": 1759041000,
  "completedAt": 1759041010,
  "preMoisture": 42.0,
  "postMoisture": 51.5,
  "serviceHash": "0xd211a46bd7855a9f3a12d85d4035b9e9bf422ead2e09a311460a7e2595388502",
  "signature": "0x..."
}
```
- **Responses**:
  - `200 OK`: Valid proof submitted to blockchain with `txHash`.
  - `400 Bad Request`: Validation failure.
  - `409 Conflict`: Duplicate submission detected for `(jobId, nonce)`.
  - `502 Bad Gateway`: Blockchain submission failed after retries.

### `GET /api/device/job/:jobId`
Fetches the current job status and proof submission record.

---

## 7. Configuration Variables

Configured in `.env` based on `.env.example`:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server listening port | `3000` |
| `NODE_ENV` | Environment mode (`development`, `test`, `production`) | `development` |
| `BLOCKCHAIN_ADAPTER_MODE` | Adapter mode (`mock` or `live`) | `mock` |
| `REQUIRE_MOISTURE_INCREASE` | Whether `postMoisture >= preMoisture` is required | `false` |
| `MAX_FUTURE_DRIFT_SECONDS` | Max allowable timestamp drift into future | `3600` |
| `MAX_RETRIES` | Relayer retry attempts before `FAILED` | `3` |
| `RETRY_DELAY_MS` | Milliseconds between relay retries | `100` |
| `MST_RPC_URL` | Live MST JSON-RPC endpoint | `https://testnet-rpc.mstscan.com` |
| `MST_CHAIN_ID` | MST Blockchain Chain ID | `91562037` |
| `MACHINE_MANDI_CONTRACT_ADDRESS` | Deployed contract address | `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE` |
| `RELAYER_PRIVATE_KEY` | Relayer wallet private key for gas fees | *(none)* |
| `DEMO_DEVICE_PRIVATE_KEY` | Node #1 device private key for local demo simulator | *(none)* |

---

## 8. Demo Device Simulator (Node #1)

For hackathon demonstration and testing without physical microcontroller hardware:
A local CLI simulator is available to submit valid, device-signed EIP-712 work proofs for Node #1 to the backend.

### Flow
```
Demo Simulator ──> POST /api/device/proof ──> Backend Validation ──> Relayer Wallet ──> contract.submitProof() ──> MST Testnet Settlement
```

### Setup & Usage
1. Set the Node #1 device private key in `backend/.env`:
   ```bash
   DEMO_DEVICE_PRIVATE_KEY=0x...
   ```
   > **SECURITY**: This private key must correspond to the registered Node #1 signer address (`0xAa0A3DC02cDc7d5e2d108DabD096C1822bc0E8b8`).
   > Never commit or expose this key. It is never logged or printed by the simulator.

2. Run the simulator against any target job ID (e.g. Job #4 created from frontend):
   ```bash
   npm run demo:proof -- 4
   ```

The simulator will:
- Query backend and on-chain contract for job & node parameters.
- Generate valid demo sensor readings (`preReading: 100`, `postReading: 160`, `delta: 60 >= 50`).
- Sign the exact EIP-712 `WorkProof` typed data struct.
- Submit to `POST http://localhost:3000/api/device/proof`.
- Display a concise report with the relayer transaction hash.

---

## 9. Available Commands

Inside `backend/`:
```bash
# Run development server with hot-reloading
npm run dev

# Compile TypeScript
npm run build

# Start production server
npm run start

# Run full automated test suite (including simulator tests)
npm test

# Run safe read-only smoke test against live MST Testnet
npm run smoke:mst

# Run Node #1 Demo Device Simulator for a job
npm run demo:proof -- <jobId>
```
