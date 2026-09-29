# MST Testnet Integration & Verification Record

> **Network**: MST Testnet  
> **Chain ID**: `91562037` (`0x57530cd` in hex)  
> **Native Asset**: `MST` (18 decimals)  
> **EVM Compatibility**: `paris`  
> **Block Explorer**: [https://testnet.mstscan.com](https://testnet.mstscan.com)  
> **RPC Endpoints**:
> - `https://testnet-rpc.mstscan.com`
> - `https://testnetrpc.mstblockchain.com`

---

## 1. Verified Live On-Chain Milestones

During the Member 2 deployment and verification phase, a rigorous multi-stage testing procedure was executed on the live MST Testnet. Every stage was recorded, broadcast, and confirmed on-chain:

```
[1. RPC Connectivity] ──> [2. MSTTest Deploy & Ping] ──> [3. Ecrecover Precompile Probe] ──> [4. MachineMandi Deploy] ──> [5. E2E Escrow & Proof Settlement]
      Chain 91562037             Block 5787337                    Block 5787768                    Block 5790572                  Node 2 & Job 2 Settled
```

---

## 2. Infrastructure Verification Transactions

### Stage 1: Basic Deployment & State Mutation (`MSTTest.sol`)
- **Contract Address**: [`0x1ebCB3D6A1D5DC349420901fc5824c55F6a27069`](https://testnet.mstscan.com/address/0x1ebCB3D6A1D5DC349420901fc5824c55F6a27069)
- **Deployment Transaction**: [`0xc1a8683f3a77d1d5ec352a1a20525100ec120e68ea967dca927e2be51d804422`](https://testnet.mstscan.com/tx/0xc1a8683f3a77d1d5ec352a1a20525100ec120e68ea967dca927e2be51d804422)
- **Deployment Block**: `5787337`
- **Ping Mutation Transaction**: [`0xec11b34dc9eadb4f70cf8c482ce91b1780551b3e1182651f48039dbeda5c93ab`](https://testnet.mstscan.com/tx/0xec11b34dc9eadb4f70cf8c482ce91b1780551b3e1182651f48039dbeda5c93ab)
- **Result**: Confirmed EVM execution, state writing, and event emission on MST Testnet.

### Stage 2: EVM Precompile Verification (`EcrecoverProbe.sol`)
- **Contract Address**: [`0x164739Ea5F1D64957b684D3797f025fd20C85FF5`](https://testnet.mstscan.com/address/0x164739Ea5F1D64957b684D3797f025fd20C85FF5)
- **Deployment Transaction**: [`0x8c39c62e42e8923acffaba260f64b5703f04a1856e61525d524163f74b5305b3`](https://testnet.mstscan.com/tx/0x8c39c62e42e8923acffaba260f64b5703f04a1856e61525d524163f74b5305b3)
- **Deployment Block**: `5787768`
- **Signature Verification Transaction**: [`0x5591f0711dcc0c3cd62b08d2a19372e4b2df9d9075ce318c7e002de088476841`](https://testnet.mstscan.com/tx/0x5591f0711dcc0c3cd62b08d2a19372e4b2df9d9075ce318c7e002de088476841)
- **Result**: Proved that the native EVM `ecrecover` precompile (`0x01`) on MST Testnet conforms strictly to Ethereum secp256k1 recovery semantics.

---

## 3. Production Protocol Deployment & Live E2E Smoke Test

### Production Contract Deployment (`MachineMandi.sol`)
- **Contract Address**: [`0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`](https://testnet.mstscan.com/address/0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE)
- **Deployment Transaction**: [`0xeb1004664c597511729d07c7b168de8d6f7e766ee5558a7e383b92f3deb8aafc`](https://testnet.mstscan.com/tx/0xeb1004664c597511729d07c7b168de8d6f7e766ee5558a7e383b92f3deb8aafc)
- **Deployment Block**: `5790572`
- **Deployer Address**: [`0x9251dA19C94686b86f22EB57e6AD9746B108F3A4`](https://testnet.mstscan.com/address/0x9251dA19C94686b86f22EB57e6AD9746B108F3A4)

### Live E2E Protocol Settlement (Node 2 / Job 2)
1. **Node 2 Registration**:
   - TX: [`0x1f1ae028ccc626f809e98b58977829556b30a6bcf39d50db97cf1c1301c3b07e`](https://testnet.mstscan.com/tx/0x1f1ae028ccc626f809e98b58977829556b30a6bcf39d50db97cf1c1301c3b07e)
   - Block: `5790993`
   - Node ID: `2`
   - Signer Address: `0xf3E1d62dF9CD13671692De6BA050fa155B293746`
   - Payout Address: `0x9251dA19C94686b86f22EB57e6AD9746B108F3A4`
   - Price: `0.0001 MST` | Min Delta: `50`
2. **Job 2 Escrow Deposit**:
   - TX: [`0xd6ecd90a651e09ce5214c790ef2a88cc6e32d6e0847871e71887484b3c70694b`](https://testnet.mstscan.com/tx/0xd6ecd90a651e09ce5214c790ef2a88cc6e32d6e0847871e71887484b3c70694b)
   - Block: `5790994`
   - Job ID: `2`, Nonce: `2`
   - Status: `0` (`STATUS_OPEN`)
3. **EIP-712 WorkProof Submission & Settlement**:
   - TX: [`0xf306295c8d4548abdbdbe8533c63a73b1acabba94c419571181d70607bbd1d73`](https://testnet.mstscan.com/tx/0xf306295c8d4548abdbdbe8533c63a73b1acabba94c419571181d70607bbd1d73)
   - Block: `5790995`
   - Telemetry Invariant: `preReading = 0`, `postReading = 150` ($\Delta = 150 \ge 50$)
   - Event: `JobCompleted`
   - Final Job Status: `1` (`STATUS_COMPLETED`)
   - Native Escrow: Automatically settled to `0x9251dA19C94686b86f22EB57e6AD9746B108F3A4`

---

## 4. Wallet & dApp Integration Parameters

To connect BridgeKey, MetaMask, or any EIP-1193 Web3 provider to MST Testnet:

```json
{
  "chainId": "0x57530cd",
  "chainName": "MST Testnet",
  "nativeCurrency": {
    "name": "MST",
    "symbol": "MST",
    "decimals": 18
  },
  "rpcUrls": ["https://testnet-rpc.mstscan.com"],
  "blockExplorerUrls": ["https://testnet.mstscan.com"]
}
```
