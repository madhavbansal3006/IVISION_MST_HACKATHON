# MachineMandi Security Specification & Threat Model

> **Scope**: Smart Contract Invariants, Cryptographic Verification, and Tested Safeguards  
> **Target Contract**: `MachineMandi.sol` (`0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`)  
> **Target Network**: MST Testnet (Chain ID `91562037`)

---

## 1. Security Invariants Tested & Verified

The following table distinguishes verified security guarantees proven by automated test suites ([`test/Security.ts`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/test/Security.ts) and [`test/EIP712.ts`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/test/EIP712.ts)) versus out-of-scope/untested assumptions:

| Security Domain | Status | Verification Detail |
| :--- | :---: | :--- |
| **Owner Access Control** | **TESTED** | `registerNode` and `deactivateNode` revert with `NotOwner()` when invoked by non-deployer addresses. |
| **Node Parameter Validation** | **TESTED** | Zero address `signer`/`payout`, zero `price`, and empty `serviceHash` revert on node registration. |
| **Exact Payment Enforcement** | **TESTED** | Overpaying or underpaying `msg.value != node.price` reverts with `IncorrectPayment()`. |
| **Inactive Node Protection** | **TESTED** | Creating a job for an inactive or nonexistent node reverts with `NodeNotActive()` or `NodeNotFound()`. |
| **Deadline Bounds** | **TESTED** | Deadlines in the past revert with `InvalidDeadline()`; deadlines $> 30\text{ days}$ revert with `DeadlineTooFar()`. |
| **Snapshot Immutability** | **TESTED** | Modifying/deactivating a node after `createJob` does not alter the already-snapshotted terms of open jobs. |
| **Replay & Nonce Binding** | **TESTED** | Signatures signed for Job A cannot be submitted for Job B; reusing nonces or cross-submitting reverts with `InvalidNonce()` or `InvalidSigner()`. |
| **Telemetry Delta Rules** | **TESTED** | Decreasing/equal readings (`postReading <= preReading`) revert with `InvalidReadings()`. Delta below threshold (`postReading - preReading < minDelta`) reverts with `InsufficientDelta()`. |
| **EIP-712 Signature Validation** | **TESTED** | Signatures signed with non-matching private keys or corrupted fields revert with `InvalidSigner()`. |
| **ECDSA Signature Malleability** | **TESTED** | OpenZeppelin `ECDSA.recover` strictly enforces low-s values and rejects malleable high-s signatures. |
| **Failed Payout Reversion** | **TESTED** | If payout wallet is a contract that rejects native currency receipt, transaction reverts with `TransferFailed()`, rolling back state. |
| **Reentrancy Protection** | **TESTED** | Reentrancy attacks attempting to recursively call `submitProof()` or `refund()` fail due to `nonReentrant` guard and Checks-Effects-Interactions. |
| **Hardware Physical Tampering** | **NOT TESTED** | Physical sensor tampering on the machine before capture is outside the on-chain smart contract scope. Physical hardware security depends on microcontroller enclave isolation. |
| **Network DoS / RPC Liveness** | **NOT TESTED** | RPC node availability on MST Testnet is handled by public infrastructure redundancy and is not an on-chain property. |

---

## 2. Escrow State Machine & Lifecycle Rules

```
                      createJob()
             [Node] ───────────────> STATUS_OPEN (0)
                                       |          |
                   submitProof()       |          |  refund()
                   (Valid EIP-712)     |          |  (block.timestamp > deadline)
                                       v          v
                           STATUS_COMPLETED (1)  STATUS_REFUNDED (2)
                              [Funds -> Payout]     [Funds -> Buyer]
```

- **`STATUS_OPEN` (0)**: Funds locked in contract escrow. Proof submissions and refunds are only accepted under strict condition checks.
- **`STATUS_COMPLETED` (1)**: **Terminal State**. State variable updated *before* payout transfer (Checks-Effects-Interactions). Re-submitting proof or attempting refund reverts with `JobNotOpen()`.
- **`STATUS_REFUNDED` (2)**: **Terminal State**. State variable updated *before* refund transfer. Re-submitting proof reverts with `JobNotOpen()`; double refund reverts with `JobAlreadyRefunded()`.

---

## 3. Relayer Zero-Knowledge Trust Model

The backend relayer is designed as an **untrusted forwarder**:
- The relayer **never** possesses, stores, or derives the device's private key.
- The relayer **cannot** forge proofs because the smart contract checks `ECDSA.recover` against `job.signer`.
- If the relayer modifies any telemetry value (`startedAt`, `preReading`, etc.), the reconstructed EIP-712 hash will not match the device's signature, causing immediate transaction reversion.
- The relayer **cannot** redirect escrow funds because payouts are strictly routed to the immutable `job.payout` address snapshotted from node registration.

---

## 4. Failed Transfer Safety

Both `submitProof` and `refund` utilize low-level `.call{value: amount}("")`:
```solidity
(bool success, ) = payable(payout).call{value: amount}("");
if (!success) revert TransferFailed();
```
If the destination wallet is a contract with a rejecting `receive()` or runs out of gas, the entire transaction reverts. Escrowed funds remain safely locked in the contract rather than being lost or burned.
