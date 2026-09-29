# MachineMandi Deployment Guide

> **Current Status**: Production deployment to MST Testnet is **ALREADY COMPLETE**.  
> **Deployed Address**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE` (Block `5790572`)  
> **Do NOT redeploy** for standard hackathon operations. This guide is provided for completeness, disaster recovery, and future network migrations.

---

## 1. Prerequisites

1. **Node.js**: v18.x or v20.x
2. **Package Manager**: npm v9+
3. **Funded Deployer Account**: An account with at least `0.05 MST` on MST Testnet.

---

## 2. Environment Configuration

Copy the template:
```bash
cp .env.example .env
```

Configure `.env`:
```env
MST_RPC_URL=https://testnet-rpc.mstscan.com
MST_CHAIN_ID=91562037
MST_EXPLORER_URL=https://testnet.mstscan.com
DEPLOYER_PRIVATE_KEY=your_deployer_private_key_here
```

> [!WARNING]
> Never commit `.env` or expose `DEPLOYER_PRIVATE_KEY`. The `.gitignore` is preconfigured to ignore `.env*` files.

---

## 3. Pre-Flight Verification

Before running deployment, verify local tests and network connectivity:

### A. Compile Contracts
```bash
npm run compile
```

### B. Execute Full Unit Test Suite (Local In-Memory EVM)
```bash
npm run test
```
*Expected: 52 passing tests (0 failures).*

### C. Check MST Testnet RPC Connectivity
```bash
npm run chain:check
```
*Validates: RPC connection, Chain ID `91562037`, deployer address, and deployer balance.*

---

## 4. Deploying to MST Testnet

Execute the deployment script:
```bash
npm run deploy:machine-mandi:mst
```

### What `scripts/deployMachineMandi.ts` Performs:
1. Asserts connected network chain ID is strictly `91562037n` (fails closed if mismatched).
2. Verifies deployer wallet has sufficient balance for deployment gas.
3. Deploys `MachineMandi.sol` using standard Paris EVM bytecode.
4. Waits for deployment confirmation on MST Testnet.
5. Updates [`deployments/mst-testnet.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/mst-testnet.json) with contract address, block number, deployer, and transaction hash.
6. Automatically exports the fresh ABI to [`deployments/abi/MachineMandi.json`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/deployments/abi/MachineMandi.json).
