# MachineMandi EIP-712 Cryptographic Signature Specification

> **Standard**: EIP-712 (Typed Structured Data Hashing and Signing)  
> **Target Network**: MST Testnet (Chain ID `91562037`)  
> **Verifying Contract**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`  
> **Signer**: Microcontroller / Physical Machine Hardware Embedded Key

---

## 1. Cryptographic Protocol Overview

The MachineMandi protocol employs standard **EIP-712 Typed Structured Data Signing** to verify telemetry proofs originating from physical IoT devices. 

When machine work is finished, the device firmware signs the `WorkProof` data structure with its embedded secp256k1 private key. The backend relayer submits the resulting 65-byte signature to `MachineMandi.submitProof(...)`. The smart contract reconstructs the EIP-712 hash on-chain, recovers the public address using OpenZeppelin's `ECDSA.recover`, and releases escrowed funds if the recovered address matches the registered node's signer.

---

## 2. EIP-712 Domain Specification

To prevent signature collision, replay attacks across different contracts, and cross-chain exploitation, all signatures must strictly bind to this domain:

```typescript
const domain = {
  name: "MachineMandi",
  version: "1",
  chainId: 91562037n,
  verifyingContract: "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE",
};
```

### Domain Field Definitions
| Field | Type | Value | Meaning |
| :--- | :--- | :--- | :--- |
| `name` | `string` | `"MachineMandi"` | Protocol human-readable identifier |
| `version` | `string` | `"1"` | Protocol major version |
| `chainId` | `uint256` | `91562037` | MST Testnet EIP-155 Chain ID |
| `verifyingContract` | `address` | `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE` | Live deployed contract address on MST Testnet |

---

## 3. WorkProof Typed Data Schema

The schema must follow this **exact field order, casing, and sequence**:

```text
WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)
```

In TypeScript / ethers v6:
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

### Typehash Constant in Smart Contract
```solidity
bytes32 public constant WORK_PROOF_TYPEHASH = keccak256(
    "WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)"
);
// Keccak-256 = 0x48ae153724c885fa2d97c36a4aa44bca1fcf7dfdf46296c00ffcfa6c4cb72e70
```

---

## 4. Field Definitions & Value Constraints

| # | Field | Type | Source | Invariant / Validation Rule |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `jobId` | `uint256` | On-Chain Job | Monotonically increasing ID created by `createJob` |
| 2 | `nodeId` | `uint256` | Target Node | Must strictly equal `job.nodeId` |
| 3 | `nonce` | `uint256` | On-Chain Job | Replay protection nonce, set equal to `job.nonce` |
| 4 | `startedAt` | `uint256` | Machine Hardware | Unix timestamp when physical process began |
| 5 | `completedAt` | `uint256` | Machine Hardware | Unix timestamp when physical process ended; must satisfy `completedAt >= startedAt` |
| 6 | `preReading` | `uint256` | Machine Sensor | Measurement before activation |
| 7 | `postReading` | `uint256` | Machine Sensor | Measurement after activation; must satisfy `postReading > preReading` and `postReading - preReading >= job.minDelta` |
| 8 | `serviceHash` | `bytes32` | Snapshotted Spec | Must strictly equal `job.serviceHash` |

---

## 5. Signature Format & Serialization

1. **Length**: Standard 65 bytes (130 hex characters prefixed with `0x`, total length 132 chars).
2. **Byte Ordering**: `r (32 bytes) || s (32 bytes) || v (1 byte)`
3. **Recovery Byte `v`**: Must be `27` or `28` (`0x1b` or `0x1c`). EIP-2098 compact 64-byte signatures or non-standard `v` values are rejected.
4. **Malleability Protection**: The contract uses OpenZeppelin `ECDSA.recover`, which strictly rejects high-s values (`s > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D57617F1A0DB2488762041944867647`).
5. **ethers Compatibility**: Fully compatible with `ethers.Signature.from(sig).serialized`.

---

## 6. Strict Protocol Prohibitions

> [!CAUTION]
> **COMPLIANCE RULES FOR BACKEND & FIRMWARE ENGINEERS:**
> 1. **DO NOT** use `personal_sign` or `eth_sign`.
> 2. **DO NOT** prepend the Ethereum Signed Message prefix (`\x19Ethereum Signed Message:\n32`).
> 3. **DO NOT** submit an outdated raw packed payload (`abi.encodePacked`).
> 4. **DO NOT** pass separate `(r, s, v)` arguments into `submitProof`.
> 5. **DO NOT** reverse or alter the argument ordering.

Any deviation will alter the recovered address on-chain, causing `submitProof` to revert with `InvalidSigner()`.
