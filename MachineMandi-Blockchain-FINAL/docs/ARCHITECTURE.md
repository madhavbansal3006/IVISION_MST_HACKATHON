# MachineMandi Blockchain Architecture

> **Protocol Purpose**: "Machines that get paid for work they can prove."  
> **Network**: MST Testnet (Chain ID `91562037`)  
> **Core Contract**: `MachineMandi.sol` (`0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`)

---

## 1. System Overview

MachineMandi is an owner-administered, cryptographically verified escrow protocol connecting autonomous hardware machines (3D printers, CNC mills, compute clusters, robotic systems) with decentralized payments on the MST blockchain.

The protocol solves the trust dilemma in automated physical machine leasing:
1. **Buyer Protection**: Buyers deposit funds into escrow rather than paying upfront. If the machine fails to deliver or misses the deadline, escrow is 100% refundable.
2. **Machine Owner Protection**: Machine owners are guaranteed payment as long as their hardware executes physical work and produces an authentic cryptographic signature over verified telemetry deltas.
3. **Zero-Knowledge Key Isolation**: Microcontrollers hold their own private signing keys in secure enclaves. Neither the backend relayer nor the buyer ever learns the device's private key.

---

## 2. End-to-End Execution Flow

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

## 3. Detailed Component Breakdown

### A. The Customer / Buyer Layer
- Connects using standard Web3 wallet (BridgeKey or MetaMask) configured for MST Testnet (Chain ID `91562037`).
- Browses available machine nodes via `getNode(nodeId)` to inspect capability (`serviceHash`), pricing (`price`), and verification standards (`minDelta`).
- Calls `createJob(nodeId, deadline)` sending exact native MST tokens into escrow.

### B. The Smart Contract Escrow Layer (`MachineMandi.sol`)
- **Point-in-Time Snapshotting**: When `createJob()` executes, the contract captures a permanent snapshot of `signer`, `payout`, `serviceHash`, and `minDelta` into the `Job` struct. Even if the owner deactivates the node later, existing jobs settle against their snapshotted terms.
- **State Machine**:
  - `STATUS_OPEN` ($0$): Escrow locked in contract.
  - `STATUS_COMPLETED` ($1$): Terminal state. Payout released to machine owner.
  - `STATUS_REFUNDED` ($2$): Terminal state. Funds returned to buyer.

### C. The Relayer Layer (Backend)
- Listens to the `JobCreated(jobId, nodeId, buyer, amount, deadline, nonce)` event log on MST Testnet.
- Reads snapshotted job details via `getJob(jobId)`.
- Dispatches execution instructions to physical hardware over secure channels (MQTT, WebSocket, or HTTPS).
- Acts as a gas sponsor: Receives the 65-byte signature and submits `submitProof(...)` paying native MST gas fees.

### D. The Hardware / Embedded Layer (ESP32-S3 / Microcontroller)
- Embedded cryptographic identity: Generates and stores a secp256k1 keypair in hardware secure element / eFuse / NVS.
- Physical telemetry enforcement: Reads sensors before execution (`preReading`) and after execution (`postReading`).
- Signs the exact 8-field EIP-712 `WorkProof` digest.
- Outputs the 65-byte serialized signature (`r || s || v`).

---

## 4. The Refund Path

If a machine experiences hardware failure, power outage, or fails to submit proof before the buyer's specified deadline:

1. Time passes until `block.timestamp > job.deadline`.
2. Any party (typically the buyer) calls `refund(jobId)`.
3. The contract validates:
   - `job.status == STATUS_OPEN`
   - `block.timestamp > job.deadline`
4. The contract transitions status: `job.status = STATUS_REFUNDED` (2).
5. The contract emits `JobRefunded(jobId, nodeId, buyer, amount)`.
6. Escrowed native MST is transferred back to `job.buyer` via low-level `.call{value: amount}("")`.
7. The job enters an immutable terminal state; subsequent calls to `submitProof` will revert with `JobNotOpen()`.

---

## 5. Security Invariant Matrix

| Invariant | Implementation Mechanism | Validation in Contract |
| :--- | :--- | :--- |
| **No Front-Running / Hijacking** | Payout address is immutable and snapshotted at creation | Funds transfer exclusively to `job.payout` |
| **No Signature Replay** | `jobId` and `nonce` are hashed into the EIP-712 digest | `nodeId != job.nodeId` or `nonce != job.nonce` reverts |
| **Cross-Chain Protection** | EIP-712 domain binds `chainId = 91562037` | OpenZeppelin `_hashTypedDataV4` verification |
| **Physical Work Guarantee** | Telemetry difference must meet `minDelta` | `postReading - preReading < minDelta` reverts |
| **Reentrancy Protection** | Checks-Effects-Interactions + `nonReentrant` | State updated before external `.call` |
| **Key Isolation** | Relayer never receives device private key | `ECDSA.recover(digest, sig) == job.signer` |
