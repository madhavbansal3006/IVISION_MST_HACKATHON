# MachineMandi

Machine-to-machine service marketplace using MST Blockchain.

## Current Components
- `backend/` — Express/TypeScript relayer backend
- `frontend/` — Next.js dApp with BridgeKey wallet integration & real settlement/refund UI
- `MachineMandi-Blockchain-FINAL/` — Frozen smart contract & deployment package

## Current MST Testnet
- **Chain ID**: 91562037
- **Contract Address**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`
- **RPC Endpoint**: `https://testnetrpc.mstblockchain.com`

## Architecture
```
Device (ESP32 / Arduino / Hardware)
  ↓ (POST signed proof)
Backend Relayer (Validation, Queue, Pre-flight)
  ↓ (submitProof transaction)
MachineMandi Smart Contract
  ↓ (On-chain Escrow & Settlement)
MST Testnet
```

## Current Status
- Blockchain deployed & verified
- Backend live adapter implemented (M3.1–M4.2)
- Relayer wallet configured & funded
- `createJob()` tested successfully
- Job #3 currently OPEN on-chain
- Hardware integration pending (ESP32/Arduino)
- Frontend intentionally deferred

## Security Policy
- Never commit `.env`
- Never expose `RELAYER_PRIVATE_KEY`
- Never commit private keys, mnemonics, or recovery phrases
