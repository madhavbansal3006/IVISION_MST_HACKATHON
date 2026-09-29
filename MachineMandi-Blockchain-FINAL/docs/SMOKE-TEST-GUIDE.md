# MachineMandi Smoke Test Guide

> **Important**: The live MST Testnet smoke test has **ALREADY PASSED** (Node 2 / Job 2 completed in blocks `5790993`–`5790995`).  
> **Do NOT run this script again** against the production deployment unless explicitly testing a new contract deployment, as it consumes real MST gas and testnet funds.

---

## 1. Purpose of the Smoke Test

The automated smoke test script [`scripts/smokeTestMachineMandi.ts`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/scripts/smokeTestMachineMandi.ts) performs a complete, atomic end-to-end protocol lifecycle validation on the live MST Testnet using a single in-memory ephemeral device keypair.

It proves five real-world blockchain invariants:
1. Owner can register a machine node on-chain.
2. Customer can lock native MST escrow into `createJob()`.
3. An embedded device can sign the exact EIP-712 `WorkProof` struct with secp256k1.
4. A relayer can submit the 65-byte serialized signature via `submitProof()`.
5. The contract verifies the proof, sets `status = STATUS_COMPLETED` (1), and transfers native escrow to the registered payout wallet.

---

## 2. Test Execution Flow (One Atomic Run)

```
[In-Memory Device Key] ──> [registerNode()] ──> [createJob()] ──> [Sign EIP-712] ──> [submitProof()] ──> [Verify Settlement]
   (Temp secp256k1)           (Node ID: N)        (Job ID: N)      (65-byte sig)        (Settle Tx)        (STATUS_COMPLETED: 1)
```

1. **Ephemeral Key Generation**:
   ```typescript
   const deviceWallet = ethers.Wallet.createRandom();
   ```
2. **Node Registration**:
   Registers `deviceWallet.address` as `node.signer`, `deployer.address` as `payout`, price as `0.0001 MST`, and `minDelta = 50`.
3. **Escrow Deposit**:
   Buyer deposits `0.0001 MST` into `createJob(nodeId, deadline)`. Nonce is generated equal to `jobId`.
4. **Physical Telemetry Simulation**:
   `preReading = 0`, `postReading = 150` ($\Delta = 150 \ge 50$).
5. **EIP-712 Typed Signing**:
   Device signs `WorkProof` using standard EIP-712 `deviceWallet.signTypedData(domain, types, value)`.
6. **Submit Proof**:
   Calls `machineMandi.submitProof(...)` with the 65-byte serialized signature.
7. **Verification**:
   - Asserts transaction status is `1` (success).
   - Asserts `JobCompleted` event was emitted with `recoveredSigner == deviceWallet.address`.
   - Asserts `job.status == 1` (`STATUS_COMPLETED`).
   - Asserts `job.preValue == 0` and `job.postValue == 150`.

---

## 3. How to Run (For New Testnet Deployments Only)

```bash
npm run smoke:machine-mandi:mst
```

### Expected Output Summary:
```
==================================================
=== REAL MST TESTNET TRANSACTION: MACHINEMANDI SMOKE TEST ===
==================================================
Target Network:       MST Testnet
Verified Chain ID:    91562037
MachineMandi Address: 0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE
Deployer Address:     0x9251dA19C94686b86f22EB57e6AD9746B108F3A4
Ephemeral Signer:     0xf3E1d62dF9CD13671692De6BA050fa155B293746
--------------------------------------------------
Registering Node...
Node Registered: ID 2 (Tx: 0x1f1ae028ccc626f809e98b58977829556b30a6bcf39d50db97cf1c1301c3b07e)
Creating Job with 0.0001 MST escrow...
Job Created: ID 2, Nonce 2 (Tx: 0xd6ecd90a651e09ce5214c790ef2a88cc6e32d6e0847871e71887484b3c70694b)
Signing EIP-712 WorkProof...
Signature: 0x28bfef0a... (65 bytes)
Submitting Proof...
Proof Submitted (Tx: 0xf306295c8d4548abdbdbe8533c63a73b1acabba94c419571181d70607bbd1d73)
Receipt Confirmed! Status: 1 (COMPLETED)
SMOKE TEST PASSED: Full E2E Lifecycle Verified on MST Testnet!
==================================================
```

---

## 4. Note on Historical Test State

- **Node 1 / Job 1**: Created during an earlier test run where the in-memory wallet terminated before proof submission. Because MachineMandi enforces strict cryptographic validation against the registered signer, Job 1 remains open until deadline expiry and will not be settled.
- **Node 2 / Job 2**: The canonical, fully verified, completed lifecycle proof.
