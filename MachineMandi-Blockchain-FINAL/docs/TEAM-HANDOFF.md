# MachineMandi Team Integration & Handoff Guide

> **Single Source of Truth for Member 1, Member 2, Member 3, and Member 4**  
> **Status**: Blockchain Layer Complete & Verified on Live MST Testnet  
> **Deployed Contract**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE` (Chain ID `91562037`)

---

## 1. Team Responsibilities & Division of Ownership

| Team Role | Primary Responsibility | Current Deliverable Status |
| :--- | :--- | :---: |
| **Member 1** (Contract / Protocol) | Smart contract architecture, EIP-712 protocol design, 52-test security and lifecycle test suite. | **COMPLETE** |
| **Member 2** (Deployment / MST Integration) | Hardhat MST integration, ecrecover compatibility validation, live deployment, E2E smoke test verification. | **COMPLETE** |
| **Member 3** (Backend / Relayer) | Event listener for `JobCreated`, hardware task dispatcher, telemetry ingestion, gas-sponsored `submitProof` execution. | **READY TO INTEGRATE** |
| **Member 4** (Frontend & Firmware) | **Frontend**: BridgeKey connection, catalog, job creation, status polling. **Firmware**: Telemetry delta tracking, EIP-712 signing in ESP32 enclave. | **READY TO INTEGRATE** |

---

## 2. Integration Checklist for Member 3 (Backend / Relayer)

- [ ] Connect WebSocket / RPC provider to `https://testnet-rpc.mstscan.com`.
- [ ] Import ABI from [`deployments/abi/MachineMandi.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/abi/MachineMandi.json).
- [ ] Listen for `JobCreated(jobId, nodeId, buyer, amount, deadline, nonce)` event log.
- [ ] Fetch job parameters using `getJob(jobId)`.
- [ ] Dispatch execution command to physical hardware over MQTT / WebSocket.
- [ ] Receive telemetry payload and 65-byte serialized signature.
- [ ] Run local pre-flight checks (delta >= minDelta, timestamps, deadline, signature check).
- [ ] Submit `submitProof(...)` transaction using funded Relayer wallet.
- [ ] Verify `JobCompleted` event log and confirmed block receipt.
- [ ] Ensure Relayer never accesses or requests the device private key.

---

## 3. Integration Checklist for Member 4 (Frontend & Firmware)

### Frontend dApp:
- [ ] Connect wallet provider via `window.bridgekey || window.ethereum`.
- [ ] Configure network switch / add for Chain ID `91562037` (`0x57530cd` hex).
- [ ] Query active machine catalog via `getNode(nodeId)`.
- [ ] Implement escrow deposit via `createJob(nodeId, deadline, { value: node.price })`.
- [ ] Extract `jobId` and `nonce` from receipt logs.
- [ ] Poll job progress via `getJob(jobId)`.
- [ ] Implement `refund(jobId)` for expired, uncompleted jobs.
- [ ] Render direct links to MSTScan: `https://testnet.mstscan.com/tx/<txHash>`.

### Embedded Firmware:
- [ ] Initialize and store secp256k1 keypair inside secure hardware storage (eFuse / NVS / ATECC608).
- [ ] Sample sensor reading before machine actuator begins (`preReading`).
- [ ] Sample sensor reading after machine actuator ends (`postReading`).
- [ ] Verify `postReading - preReading >= minDelta`.
- [ ] Construct EIP-712 `WorkProof` struct matching on-chain fields.
- [ ] Calculate digest and sign with internal secp256k1 key.
- [ ] Output standard 65-byte serialized signature (`r || s || v`).
- [ ] Transmit payload and signature to backend relayer.

---

## 4. 10-Step Live Hackathon Demonstration Flow

```
1. Customer connects BridgeKey to MST Testnet (Chain ID 91562037).
2. Customer selects a 3D Printer / Machine Node from catalog.
3. Customer deposits 0.0001 MST escrow via createJob().
   -> MSTScan shows JobCreated with escrow locked.
4. Machine hardware activates and measures starting telemetry (preReading = 0).
5. Machine finishes physical job and measures completed telemetry (postReading = 150).
6. Machine microcontroller signs EIP-712 WorkProof using its internal private key.
7. Backend relayer transmits the 65-byte signature via submitProof().
8. Contract validates signature against snapshotted device signer and releases escrow to machine owner.
9. Frontend updates status badge to COMPLETED (1).
10. Presenter clicks MSTScan transaction links live during presentation to prove real settlement.
```
