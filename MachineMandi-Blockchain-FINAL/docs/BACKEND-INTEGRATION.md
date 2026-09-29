# MachineMandi Backend & Relayer Integration Guide

> **Target Audience**: Member 3 (Backend / Relayer Engineer)  
> **Deployed Contract**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`  
> **Network**: MST Testnet (Chain ID `91562037`)  
> **ABI Location**: [`deployments/abi/MachineMandi.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/abi/MachineMandi.json)

---

## 1. Backend / Relayer Role

In the MachineMandi protocol, the **Backend / Relayer** acts as the communication and transaction bridge between end-users, off-chain machine microcontrollers, and the MST blockchain:

1. **Event Listening**: Continuously monitors the contract for `JobCreated` events.
2. **Device Coordination**: Dispatches task parameters to the physical microcontroller.
3. **Telemetry Ingestion**: Receives physical telemetry readings and the 65-byte EIP-712 signature from the device.
4. **Local Verification**: Validates sensor deltas and EIP-712 signature locally before spending gas.
5. **Gas Sponsorship**: Executes `submitProof(...)` on MST Testnet using a funded relayer wallet.

---

## 2. Key Separation & Device Security Invariant

> [!CAUTION]
> **CRITICAL SECURITY RULE FOR MEMBER 3:**
> - The Relayer **MUST NEVER** receive, store, request, or generate the device's private key.
> - The Relayer only forwards the **already-created 65-byte serialized signature** produced by the physical machine.
> - The Relayer **MUST NOT** substitute its own address as the signer; `MachineMandi` recovers the signer via `ECDSA.recover` and will revert with `InvalidSigner()` if it does not match the node's registered `signer`.

---

## 3. Step-by-Step Backend Flow

```
[Listen: JobCreated] ──> [Query: getJob()] ──> [Dispatch to IoT] ──> [Receive 65-byte Sig] ──> [Pre-Flight Check] ──> [submitProof()] ──> [JobCompleted]
```

### Step 1: Initialize Provider & Relayer Signer
```typescript
import { ethers } from "ethers";
import MachineMandiABI from "../deployments/abi/MachineMandi.json";

const MST_RPC_URL = process.env.MST_RPC_URL || "https://testnet-rpc.mstscan.com";
const CONTRACT_ADDRESS = "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY!;

const provider = new ethers.JsonRpcProvider(MST_RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

const machineMandi = new ethers.Contract(CONTRACT_ADDRESS, MachineMandiABI, relayerWallet);
```

### Step 2: Listen for `JobCreated`
```typescript
machineMandi.on("JobCreated", async (jobId, nodeId, buyer, amount, deadline, nonce, event) => {
  console.log(`[EVENT] JobCreated detected: Job ID ${jobId}, Node ID ${nodeId}, Nonce ${nonce}`);
  await handleNewJob(jobId);
});
```

### Step 3: Fetch Job Details
```typescript
async function handleNewJob(jobId: bigint) {
  const job = await machineMandi.getJob(jobId);

  const jobDetails = {
    jobId: BigInt(jobId),
    nodeId: BigInt(job.nodeId ?? job[0]),
    buyer: (job.buyer ?? job[1]) as string,
    amount: BigInt(job.amount ?? job[2]),
    createdAt: BigInt(job.createdAt ?? job[3]),
    deadline: BigInt(job.deadline ?? job[4]),
    nonce: BigInt(job.nonce ?? job[5]),
    status: Number(job.status ?? job[6]), // 0 = OPEN
    signer: (job.signer ?? job[9]) as string,
    payout: (job.payout ?? job[10]) as string,
    serviceHash: (job.serviceHash ?? job[11]) as string,
    minDelta: BigInt(job.minDelta ?? job[12]),
  };

  if (jobDetails.status !== 0) return; // Only process OPEN jobs

  // Dispatch parameters to physical machine over MQTT / WebSocket
  await dispatchToDevice(jobDetails);
}
```

### Step 4: Dispatch Payload to Machine Microcontroller
```json
{
  "command": "START_JOB",
  "jobId": "2",
  "nodeId": "2",
  "nonce": "2",
  "serviceHash": "0xd211a46bd7855a9f3a12d85d4035b9e9bf422ead2e09a311460a7e2595388502",
  "minDelta": "50",
  "deadline": "1790628940"
}
```

### Step 5: Receive Payload from Hardware & Validate Locally
```typescript
interface DeviceProofPayload {
  jobId: string;
  nodeId: string;
  nonce: string;
  startedAt: string;
  completedAt: string;
  preReading: string;
  postReading: string;
  serviceHash: string;
  signature: string; // 65-byte hex (0x...)
}

function validateProofPreFlight(payload: DeviceProofPayload, job: any) {
  const pre = BigInt(payload.preReading);
  const post = BigInt(payload.postReading);
  const started = BigInt(payload.startedAt);
  const completed = BigInt(payload.completedAt);

  if (post <= pre) throw new Error("Invalid readings: postReading <= preReading");
  if (post - pre < job.minDelta) throw new Error("Insufficient delta for job verification");
  if (completed < started) throw new Error("Invalid timestamps: completedAt < startedAt");
  if (completed > job.deadline) throw new Error("Job deadline expired before completion");
  if (payload.signature.length !== 132) throw new Error("Invalid signature length; expected 65 bytes (132 hex chars)");

  // Local EIP-712 signature verification
  const domain = {
    name: "MachineMandi",
    version: "1",
    chainId: 91562037n,
    verifyingContract: "0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE",
  };

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

  const value = {
    jobId: BigInt(payload.jobId),
    nodeId: BigInt(payload.nodeId),
    nonce: BigInt(payload.nonce),
    startedAt: started,
    completedAt: completed,
    preReading: pre,
    postReading: post,
    serviceHash: payload.serviceHash,
  };

  const recovered = ethers.verifyTypedData(domain, types, value, payload.signature);
  if (recovered.toLowerCase() !== job.signer.toLowerCase()) {
    throw new Error(`Signature mismatch: recovered ${recovered} does not match node signer ${job.signer}`);
  }
}
```

### Step 6: Submit Proof to Blockchain
```typescript
async function relayProof(payload: DeviceProofPayload) {
  console.log(`Submitting proof for Job ${payload.jobId} to MST Testnet...`);

  const tx = await machineMandi.submitProof(
    BigInt(payload.jobId),
    BigInt(payload.nodeId),
    BigInt(payload.nonce),
    BigInt(payload.startedAt),
    BigInt(payload.completedAt),
    BigInt(payload.preReading),
    BigInt(payload.postReading),
    payload.serviceHash,
    payload.signature // 65-byte serialized ECDSA signature
  );

  console.log(`Tx broadcast: https://testnet.mstscan.com/tx/${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log(`Job ${payload.jobId} settled successfully in block ${receipt.blockNumber}!`);
  }
}
```

---

## 4. Error Code Reference

- `JobNotOpen()`: Job has already settled or been refunded.
- `DeadlineExpired()`: Proof submitted after `job.deadline`.
- `InvalidNodeId()`: Submitted `nodeId != job.nodeId`.
- `InvalidNonce()`: Submitted `nonce != job.nonce`.
- `InvalidServiceHash()`: Submitted `serviceHash != job.serviceHash`.
- `InvalidTimestamps()`: `completedAt < startedAt`.
- `InvalidReadings()`: `postReading <= preReading`.
- `InsufficientDelta()`: `postReading - preReading < job.minDelta`.
- `InvalidSigner()`: Recovered EIP-712 signer != `job.signer`.
- `TransferFailed()`: Node payout address reverted on native MST receipt.
