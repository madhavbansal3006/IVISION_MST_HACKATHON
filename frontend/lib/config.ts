/**
 * Centralized Blockchain and Service Configuration for MachineMandi Frontend
 *
 * Network: MST Testnet
 * Chain ID: 91562037 (0x5752035)
 * Deployed MachineMandi Contract: 0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE
 */

export const MST_CHAIN_ID = 91562037;
export const MST_CHAIN_ID_HEX = '0x5752035';

export const MST_RPC_URL =
  process.env.NEXT_PUBLIC_MST_RPC_URL || 'https://testnetrpc.mstblockchain.com';

export const MACHINE_MANDI_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_MACHINE_MANDI_CONTRACT_ADDRESS ||
  '0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE';

export const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export const MST_NETWORK_CONFIG = {
  chainId: MST_CHAIN_ID_HEX,
  chainName: 'MST Testnet',
  nativeCurrency: {
    name: 'MST',
    symbol: 'MST',
    decimals: 18,
  },
  rpcUrls: [MST_RPC_URL],
  blockExplorerUrls: ['https://testnet.mstscan.com'],
} as const;
