# MachineMandi Frontend dApp Integration Guide

> **Target Audience**: Member 4 (Frontend dApp Engineer)  
> **Target Network**: MST Testnet (Chain ID `91562037`)  
> **Deployed Contract**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`  
> **ABI Location**: [`deployments/abi/MachineMandi.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/abi/MachineMandi.json)  
> **Explorer**: [https://testnet.mstscan.com](https://testnet.mstscan.com)

---

## 1. Environment Variables

In your Vite / React / Next.js project:

```env
VITE_MST_CHAIN_ID=91562037
VITE_MST_RPC_URL=https://testnet-rpc.mstscan.com
VITE_MST_EXPLORER_URL=https://testnet.mstscan.com
VITE_MACHINE_MANDI_ADDRESS=0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE
```

---

## 2. Wallet Connection (BridgeKey & MetaMask)

The frontend must support both BridgeKey native provider and standard EIP-1193 providers:

```typescript
import { ethers } from "ethers";
import MachineMandiABI from "../deployments/abi/MachineMandi.json";

const MST_CHAIN_ID_HEX = "0x57530cd"; // 91562037 in hex

function getProvider() {
  const provider = (window as any).bridgekey || (window as any).ethereum;
  if (!provider) {
    throw new Error("BridgeKey or compatible Web3 wallet not detected. Please install BridgeKey.");
  }
  return provider;
}

export async function connectWallet() {
  const injected = getProvider();
  const browserProvider = new ethers.BrowserProvider(injected);
  const accounts = await browserProvider.send("eth_requestAccounts", []);
  const signer = await browserProvider.getSigner();

  // Ensure network is MST Testnet
  await switchOrAddMSTTestnet(injected);

  return { account: accounts[0], signer, browserProvider };
}

export async function switchOrAddMSTTestnet(injected: any) {
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MST_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: MST_CHAIN_ID_HEX,
            chainName: "MST Testnet",
            nativeCurrency: {
              name: "MST",
              symbol: "MST",
              decimals: 18,
            },
            rpcUrls: [import.meta.env.VITE_MST_RPC_URL || "https://testnet-rpc.mstscan.com"],
            blockExplorerUrls: ["https://testnet.mstscan.com"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
```

---

## 3. Reading the Machine Catalog (`getNode`)

There is **NO `updateNode()` function**. Each registered node has immutable parameters:

```typescript
export interface NodeData {
  nodeId: bigint;
  signer: string;
  payout: string;
  serviceHash: string;
  price: bigint;
  priceFormatted: string;
  minDelta: bigint;
  active: boolean;
}

export async function fetchNode(contract: ethers.Contract, nodeId: bigint): Promise<NodeData> {
  const raw = await contract.getNode(nodeId);
  return {
    nodeId,
    signer: raw.signer ?? raw[0],
    payout: raw.payout ?? raw[1],
    serviceHash: raw.serviceHash ?? raw[2],
    price: BigInt(raw.price ?? raw[3]),
    priceFormatted: ethers.formatEther(raw.price ?? raw[3]),
    minDelta: BigInt(raw.minDelta ?? raw[4]),
    active: Boolean(raw.active ?? raw[5]),
  };
}
```

---

## 4. Creating an Escrow Job (`createJob`)

Customers reserve machines and escrow native MST tokens:

```typescript
export async function createMachineJob(
  contractWithSigner: ethers.Contract,
  nodeId: bigint,
  nodePriceWei: bigint,
  durationSeconds: number = 3600 // Default 1 hour deadline
) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + durationSeconds);

  // Send exact price as msg.value
  const tx = await contractWithSigner.createJob(nodeId, deadline, {
    value: nodePriceWei,
  });

  const receipt = await tx.wait();

  // Extract jobId and nonce from JobCreated event log
  const log = receipt.logs
    .map((l: any) => {
      try {
        return contractWithSigner.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "JobCreated");

  const jobId = BigInt(log.args[0]);
  const nonce = BigInt(log.args[5]);

  return {
    txHash: tx.hash,
    explorerUrl: `https://testnet.mstscan.com/tx/${tx.hash}`,
    jobId,
    nonce,
    deadline,
  };
}
```

---

## 5. Polling & Monitoring Job Progress (`getJob`)

```typescript
export interface JobData {
  jobId: bigint;
  nodeId: bigint;
  buyer: string;
  amount: bigint;
  createdAt: bigint;
  deadline: bigint;
  nonce: bigint;
  status: number; // 0 = OPEN, 1 = COMPLETED, 2 = REFUNDED
  statusLabel: "OPEN" | "COMPLETED" | "REFUNDED";
  preValue: bigint;
  postValue: bigint;
  signer: string;
  payout: string;
  serviceHash: string;
  minDelta: bigint;
}

export async function fetchJob(contract: ethers.Contract, jobId: bigint): Promise<JobData> {
  const raw = await contract.getJob(jobId);
  const statusNum = Number(raw.status ?? raw[6]);

  const labels: Record<number, "OPEN" | "COMPLETED" | "REFUNDED"> = {
    0: "OPEN",
    1: "COMPLETED",
    2: "REFUNDED",
  };

  return {
    jobId,
    nodeId: BigInt(raw.nodeId ?? raw[0]),
    buyer: raw.buyer ?? raw[1],
    amount: BigInt(raw.amount ?? raw[2]),
    createdAt: BigInt(raw.createdAt ?? raw[3]),
    deadline: BigInt(raw.deadline ?? raw[4]),
    nonce: BigInt(raw.nonce ?? raw[5]),
    status: statusNum,
    statusLabel: labels[statusNum] || "OPEN",
    preValue: BigInt(raw.preValue ?? raw[7]),
    postValue: BigInt(raw.postValue ?? raw[8]),
    signer: raw.signer ?? raw[9],
    payout: raw.payout ?? raw[10],
    serviceHash: raw.serviceHash ?? raw[11],
    minDelta: BigInt(raw.minDelta ?? raw[12]),
  };
}
```

---

## 6. Claiming a Refund (`refund`)

If a job is still `OPEN` (status `0`) and current time has passed `job.deadline`:

```typescript
export async function claimRefund(contractWithSigner: ethers.Contract, jobId: bigint) {
  const tx = await contractWithSigner.refund(jobId);
  const receipt = await tx.wait();
  return {
    txHash: tx.hash,
    explorerUrl: `https://testnet.mstscan.com/tx/${tx.hash}`,
    status: "REFUNDED",
  };
}
```

---

## 7. UI Display Guidance

1. **Active Escrow Badge**:
   - `OPEN` (Amber / Pulse): Escrow locked on MST Testnet. Waiting for machine execution & proof submission.
   - `COMPLETED` (Emerald / Check): Work verified cryptographically. Native MST escrow released to machine owner. Displays initial and final sensor readings (`preValue`, `postValue`).
   - `REFUNDED` (Red / Gray): Deadline expired without verified proof; native funds returned to buyer.
2. **MSTScan Verification Links**:
   - Always link transaction hashes directly to `https://testnet.mstscan.com/tx/<txHash>`.
