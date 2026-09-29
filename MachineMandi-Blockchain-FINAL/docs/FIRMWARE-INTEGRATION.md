# MachineMandi Firmware & Hardware Integration Guide

> **Target Device**: ESP32-S3 / Secure Element (ATECC608) / Microcontroller  
> **Target Network**: MST Testnet (Chain ID `91562037`)  
> **Verifying Contract**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`

---

## 1. Hardware Security Architecture

In MachineMandi, a physical machine is cryptographically represented on-chain by an embedded **secp256k1 keypair**.

> [!CAUTION]
> **KEY ISOLATION RULES:**
> 1. The device private key must **NEVER** leave the physical device or secure enclave (ESP32-S3 eFuse, NVS, or ATECC608).
> 2. The device private key must **NEVER** be transmitted over UART, debug logs, BLE, Wi-Fi, MQTT, or HTTP.
> 3. The Backend / Relayer **MUST NOT** possess the device key.
> 4. The public address derived from this key is registered by the contract owner as `node.signer`.

---

## 2. Invariants & Telemetry Rules

Before generating the EIP-712 signature, firmware must enforce these physical truth conditions:

1. **`preReading`**: Sensor measurement recorded immediately before machine actuator/process begins.
2. **`postReading`**: Sensor measurement recorded immediately after machine actuator/process finishes.
3. **Monotonic Positive Delta**: `postReading > preReading` (contract reverts with `InvalidReadings()` if `postReading <= preReading`).
4. **Minimum Delta**: `postReading - preReading >= minDelta` (contract reverts with `InsufficientDelta()` if below threshold).
5. **Chronological Validity**:
   - `startedAt`: Unix timestamp when machine started work.
   - `completedAt`: Unix timestamp when machine finished work.
   - `completedAt >= startedAt` (contract reverts with `InvalidTimestamps()` if `completedAt < startedAt`).

---

## 3. Exact EIP-712 Signing Specification

### A. Domain Parameters
```
Domain Name:              "MachineMandi"
Domain Version:           "1"
Chain ID:                 91562037
Verifying Contract:       0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE
```

### B. Typed Structure
```
WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)
```

### C. Typehash Constants
```
EIP712Domain Typehash:
keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")

WorkProof Typehash:
keccak256("WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)")
= 0x48ae153724c885fa2d97c36a4aa44bca1fcf7dfdf46296c00ffcfa6c4cb72e70
```

---

## 4. Hashing & Signing Pipeline (C / ESP-IDF / MicroPython)

### Step 1: Compute Domain Separator
```
domainSeparator = keccak256(
    abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        keccak256("MachineMandi"),
        keccak256("1"),
        91562037,
        0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE
    )
)
```

### Step 2: Compute Struct Hash
```
structHash = keccak256(
    abi.encode(
        WORK_PROOF_TYPEHASH,
        jobId,          // uint256 (32 bytes big-endian)
        nodeId,         // uint256 (32 bytes big-endian)
        nonce,          // uint256 (32 bytes big-endian)
        startedAt,      // uint256 (32 bytes big-endian)
        completedAt,    // uint256 (32 bytes big-endian)
        preReading,     // uint256 (32 bytes big-endian)
        postReading,    // uint256 (32 bytes big-endian)
        serviceHash     // bytes32 (32 bytes)
    )
)
```

### Step 3: Compute Final Digest
```
digest = keccak256(
    concat(
        "\x19\x01",
        domainSeparator,
        structHash
    )
)
```

### Step 4: Sign Digest with Device Private Key
Sign `digest` (32 bytes) using `uECC` (micro-ecc) or `mbedtls`:
- Generate `r` (32 bytes)
- Generate `s` (32 bytes)
- Generate recovery ID `v` (`27` or `28`)

### Step 5: Format 65-Byte Serialized Signature
Concatenate bytes:
`signature = r (32 bytes) || s (32 bytes) || v (1 byte)` (Total: 65 bytes / 130 hex characters prefixed with `0x`).

> [!WARNING]
> **DO NOT** use `personal_sign` or prepend `\x19Ethereum Signed Message:\n32`. The contract enforces pure EIP-712 `_hashTypedDataV4`.

---

## 5. Output Payload Transmitted to Relayer

Upon job completion, the firmware transmits this JSON over Wi-Fi / MQTT / Serial:

```json
{
  "jobId": "2",
  "nodeId": "2",
  "nonce": "2",
  "startedAt": "1790627150",
  "completedAt": "1790627170",
  "preReading": "0",
  "postReading": "150",
  "serviceHash": "0xd211a46bd7855a9f3a12d85d4035b9e9bf422ead2e09a311460a7e2595388502",
  "signature": "0x28bfef0a6596377dc76ce4e8992ad81665a3cff99b6623bc1106f23bdf60ffb821415df8e448b111be0768e7ec8942b0ce8145242d992f03f386f68593a2eb631c"
}
```
*(The signature above is an example 65-byte serialized hex string matching the exact format proven in the live MST Testnet smoke test).*
