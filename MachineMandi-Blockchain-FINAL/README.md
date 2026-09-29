# MachineMandi Blockchain

> **"Machines that get paid for work they can prove."**

MachineMandi is an owner-administered, cryptographically verified escrow and settlement protocol designed for machine-to-machine (M2M) leasing and automated physical task execution. It bridges real-world physical machines (3D printers, CNC mills, compute nodes) with on-chain payments on the MST blockchain.

---

## 1. Project Overview

Autonomous machines require automated, trustless settlement mechanisms. Traditional payment rails require human intervention, high credit card fees, and risk chargebacks. MachineMandi provides a native blockchain escrow protocol where:
1. **Buyers** reserve machines by locking native MST cryptocurrency in escrow.
2. **Physical Machines** execute physical tasks and measure sensor telemetry deltas.
3. **Embedded Microcontrollers** sign cryptographic work proofs using internal private keys via **EIP-712**.
4. **Relayers** submit the proofs on-chain, automatically unlocking escrow payouts directly to the machine owner's wallet upon verification.

---

## 2. Blockchain Architecture

```
                      CUSTOMER
                         │
                         ▼
                     FRONTEND (dApp)
                         │ (createJob + native MST deposit)
                         ▼
                    MST TESTNET
                         │
                         ▼
                MACHINEMANDI ESCROW (STATUS_OPEN = 0)
                         │
                         │ (JobCreated Event Emitted)
                         ▼
                 BACKEND / RELAYER
                         │
                         │ (Dispatch Task Parameters)
                         ▼
                  ESP32-S3 / MACHINE
                         │
                         ├── 1. Capture Sensor Pre-Reading (preReading)
                         ├── 2. Perform Physical Machine Work
                         ├── 3. Capture Sensor Post-Reading (postReading)
                         │      Assert (postReading - preReading >= minDelta)
                         │
                         ▼
              DEVICE EIP-712 SIGNATURE
             (secp256k1 signature over WorkProof struct)
                         │
                         │ (Return 65-byte signature + telemetry)
                         ▼
                 BACKEND / RELAYER
                         │
                         │ (submitProof() transaction paying MST gas)
                         ▼
             MACHINEMANDI CONTRACT VERIFICATION
                         │
            ┌────────────┴────────────┐
            │                         │
     [Valid Proof]             [Expired & Incomplete]
            │                         │
            ▼                         ▼
   SETTLEMENT (Status 1)     REFUND PATH (Status 2)
            │                         │
            ▼                         ▼
      MACHINE PAYOUT             BUYER REFUND
  (Escrow -> node.payout)    (Escrow -> job.buyer)
```

---

## 3. Team Contributions

### Member 1 — Contract, Protocol & Test Engineering
- Architected the `MachineMandi.sol` smart contract and escrow state machine.
- Designed the EIP-712 cryptographic WorkProof verification mechanism.
- Implemented the point-in-time snapshotting architecture ensuring immutable terms for active jobs.
- Authored the comprehensive 52-test Hardhat test suite covering contract lifecycle, EIP-712 typing, and security invariants.

### Member 2 — MST Integration, Deployment & Verification
- Configured Hardhat for MST Testnet (Chain ID `91562037`, Paris EVM target).
- Built and validated live EVM compatibility probes (`MSTTest.sol` and `EcrecoverProbe.sol`).
- Deployed production `MachineMandi.sol` to the live MST Testnet.
- Executed and verified the live end-to-end smoke test (Node 2 / Job 2 settlement).
- Serialized production deployment artifacts and exported canonical ABIs.
- Formulated the consolidated blockchain handoff documentation for Members 3 and 4.

---

## 4. Current Live Deployment

The protocol is live, immutable, and verified on the public MST Testnet:

- **Contract Address**: [`0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`](https://testnet.mstscan.com/address/0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE)
- **Deployment Transaction**: [`0xeb1004664c597511729d07c7b168de8d6f7e766ee5558a7e383b92f3deb8aafc`](https://testnet.mstscan.com/tx/0xeb1004664c597511729d07c7b168de8d6f7e766ee5558a7e383b92f3deb8aafc)
- **Deployment Block**: `5790572`
- **Deployer / Owner**: [`0x9251dA19C94686b86f22EB57e6AD9746B108F3A4`](https://testnet.mstscan.com/address/0x9251dA19C94686b86f22EB57e6AD9746B108F3A4)
- **Deployment Record**: [`deployments/mst-testnet.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/mst-testnet.json)
- **Exported ABI**: [`deployments/abi/MachineMandi.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/abi/MachineMandi.json)

---

## 5. MST Testnet Configuration

| Parameter | Configuration |
| :--- | :--- |
| **Network Name** | MST Testnet |
| **Chain ID** | `91562037` (`0x57530cd` hex) |
| **Native Asset** | `MST` (18 decimals) |
| **RPC URL** | `https://testnet-rpc.mstscan.com` |
| **Block Explorer** | [https://testnet.mstscan.com](https://testnet.mstscan.com) |
| **Target EVM** | `paris` |

---

## 6. Smart Contract Core Data Structures

### `Node` Struct
```solidity
struct Node {
    address signer;      // Authorized hardware device key that signs telemetry
    address payout;      // Wallet receiving escrow settlement upon completion
    bytes32 serviceHash; // Cryptographic hash representing machine service specs
    uint256 price;       // Fixed price in native wei required to create a job
    uint256 minDelta;    // Minimum required telemetry increment (postReading - preReading)
    bool active;         // Operational status (true = active, false = deactivated)
}
```

### `Job` Struct
```solidity
struct Job {
    uint256 nodeId;      // ID of the designated node
    address buyer;       // Buyer funding the escrow
    uint256 amount;      // Escrowed amount in native wei (must match node.price)
    uint256 createdAt;   // Unix timestamp of job creation
    uint256 deadline;    // Execution cutoff timestamp (max 30 days)
    uint256 nonce;       // Replay-prevention nonce (set equal to jobId)
    uint8 status;        // 0 = OPEN, 1 = COMPLETED, 2 = REFUNDED
    uint256 preValue;    // Telemetry reading before execution (recorded on completion)
    uint256 postValue;   // Telemetry reading after execution (recorded on completion)
    address signer;      // Snapshotted authorized signer
    address payout;      // Snapshotted payout receiver
    bytes32 serviceHash; // Snapshotted service specification hash
    uint256 minDelta;    // Snapshotted minimum required delta
}
```

### Status Definitions
- `0 = STATUS_OPEN`: Job created, native escrow locked in contract.
- `1 = STATUS_COMPLETED`: EIP-712 proof verified, funds released to payout. **(Terminal)**
- `2 = STATUS_REFUNDED`: Deadline expired without proof, funds returned to buyer. **(Terminal)**

---

## 7. EIP-712 Specification

### Domain Separator
```typescript
const domain = {
  name: "MachineMandi",
  version: "1",
  chainId: 91562037n,
  verifyingContract: "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE",
};
```

### WorkProof Typed Schema (Exact Field Order)
```text
WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)
```

### Signature Rules
- Standard 65-byte serialized ECDSA signature: `r (32 bytes) || s (32 bytes) || v (1 byte)`.
- Pure EIP-712 `signTypedData` only.
- Strict prohibitions: No `personal_sign`, no `eth_sign`, no message prefixes, no separate `(r, s)` arguments.

---

## 8. Directory Structure

```
MachineMandi-Blockchain-FINAL/
│
├── README.md                          # Top-level project documentation
│
├── contracts/                         # Solidity smart contracts
│   ├── MachineMandi.sol               # Core protocol contract (authoritative deployed)
│   ├── RejectingReceiver.sol          # Test helper for failed payout handling
│   ├── MSTTest.sol                    # MST Testnet connectivity verification contract
│   └── EcrecoverProbe.sol             # MST Testnet ecrecover precompile verification contract
│
├── interfaces/                        # Smart contract interfaces
│   └── .gitkeep
│
├── libraries/                         # Solidity libraries
│   └── .gitkeep
│
├── test/                              # Hardhat automated test suite (52 tests)
│   ├── EIP712.ts                      # Cryptographic typing & signature verification tests
│   ├── MachineMandi.ts                # Protocol lifecycle & state machine tests
│   ├── Security.ts                    # Reentrancy, access control, and invariant tests
│   └── EcrecoverProbe.test.ts         # MST Testnet ecrecover compatibility unit tests
│
├── scripts/                           # Deployment and integration automation
│   ├── checkNetwork.ts                # Validates RPC connection, Chain ID, and deployer balance
│   ├── deployMSTTest.ts               # Deploys basic MST test contract
│   ├── pingMSTTest.ts                 # Pings test contract to verify EVM execution
│   ├── ecrecoverTest.ts               # Verifies EVM ecrecover precompile on live network
│   ├── deployMachineMandi.ts          # Production deployment script for MachineMandi
│   └── smokeTestMachineMandi.ts       # Live atomic E2E smoke test script
│
├── deployments/                       # Live deployment records & exported ABIs
│   ├── abi/
│   │   └── MachineMandi.json          # Canonical exported contract ABI
│   └── mst-testnet.json               # Serialized deployment registry on MST Testnet
│
├── artifacts/                         # Compilation output
│   └── contracts/MachineMandi.sol/    # MachineMandi Hardhat build artifact
│
├── config/                            # Environment & network configuration constants
│   ├── network.json                   # Network constants (Chain ID, RPCs, Explorers)
│   └── contracts.json                 # Deployed contract registry
│
├── docs/                              # Comprehensive integration specifications
│   ├── ARCHITECTURE.md                # System-wide architecture and transaction flows
│   ├── CONTRACT-SPECIFICATION.md      # Method-by-method smart contract interface spec
│   ├── EIP712-SIGNATURE-SPECIFICATION.md # Hardware signing & verification rules
│   ├── MST-TESTNET.md                 # MST Testnet configuration & transaction records
│   ├── DEPLOYMENT-GUIDE.md            # Step-by-step deployment procedure
│   ├── SMOKE-TEST-GUIDE.md            # E2E live smoke test execution guide
│   ├── BACKEND-INTEGRATION.md         # Relayer & backend integration guide (Member 3)
│   ├── FIRMWARE-INTEGRATION.md        # ESP32-S3 firmware & signing guide (Member 4)
│   ├── FRONTEND-INTEGRATION.md        # BridgeKey dApp integration guide (Member 4)
│   ├── SECURITY.md                    # Threat model & tested security invariants
│   ├── TEAM-HANDOFF.md                # Responsibilities, checklists, and 10-step demo flow
│   ├── BLOCKCHAIN-FREEZE.md           # Implementation freeze policy & future migration rules
│   └── KNOWN-LIMITATIONS.md           # Explicit boundaries of the deployed contract
│
├── package.json                       # Project scripts and dependencies
├── package-lock.json                  # Pinned dependency lockfile
├── hardhat.config.ts                  # Hardhat configuration (Paris EVM, MST network)
├── tsconfig.json                      # TypeScript configuration
├── .env.example                       # Environment variables template
└── .gitignore                         # Secret protection and build artifact exclusions
```

---

## 9. Installation & Local Setup

```bash
# Clone or navigate to the repository
cd MachineMandi-Blockchain-FINAL

# Install exact pinned dependencies
npm install

# Copy environment template
cp .env.example .env
```

---

## 10. Development Workflow

### Compile Contracts
```bash
npm run compile
```

### Run Full Test Suite (Local In-Memory EVM)
```bash
npm run test
```
*All 52 tests pass in ~2 seconds.*

### Check Live MST Testnet RPC Connectivity
```bash
npm run chain:check
```

### Production Deployment (For Reference / Disaster Recovery Only)
```bash
npm run deploy:machine-mandi:mst
```

### Run Live End-to-End Smoke Test (Optional Live Validation)
```bash
npm run smoke:machine-mandi:mst
```

---

## 11. Handoff Guides for Other Members

- **Member 3 (Backend / Relayer)**: Read [`docs/BACKEND-INTEGRATION.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/BACKEND-INTEGRATION.md).
- **Member 4 (Firmware / Hardware)**: Read [`docs/FIRMWARE-INTEGRATION.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/FIRMWARE-INTEGRATION.md).
- **Member 4 (Frontend dApp)**: Read [`docs/FRONTEND-INTEGRATION.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/FRONTEND-INTEGRATION.md).
- **Security & Protocol Specifications**: Read [`docs/SECURITY.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/SECURITY.md) and [`docs/CONTRACT-SPECIFICATION.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/CONTRACT-SPECIFICATION.md).
- **Team Demo Guide**: Read [`docs/TEAM-HANDOFF.md`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/docs/TEAM-HANDOFF.md).
