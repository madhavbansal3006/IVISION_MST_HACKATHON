import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

/**
 * Application Configuration
 *
 * NOTE:
 * - Do NOT hardcode an MST RPC, contract address, or chain ID.
 * - These values are provided exclusively via environment variables.
 * - When blockchain credentials are absent, the application runs seamlessly in 'mock' mode.
 * - Under NO circumstances does the backend store or manage device private keys.
 *   The relayer wallet (if configured) only provides gas for tx relaying.
 */
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Blockchain adapter mode: 'mock' (default) or 'live'
  blockchainAdapterMode:
    (process.env.BLOCKCHAIN_ADAPTER_MODE as 'mock' | 'live') || 'mock',
  validation: {
    // Configurable rule: whether postMoisture must be >= preMoisture
    requireMoistureIncrease: process.env.REQUIRE_MOISTURE_INCREASE === 'true',
    // Max allowable future timestamp drift in seconds (0 to disable)
    maxFutureDriftSeconds: process.env.MAX_FUTURE_DRIFT_SECONDS
      ? parseInt(process.env.MAX_FUTURE_DRIFT_SECONDS, 10)
      : 3600,
  },
  retry: {
    // Maximum number of submission retry attempts before marking as FAILED
    maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES, 10) : 3,
    // Base delay between retries in milliseconds
    retryDelayMs: process.env.RETRY_DELAY_MS ? parseInt(process.env.RETRY_DELAY_MS, 10) : 100,
  },
  relayer: {
    // Relayer private key for signing blockchain transactions (pays gas)
    privateKey: process.env.RELAYER_PRIVATE_KEY || '',
    // MST Blockchain RPC URL (provided via env)
    rpcUrl: process.env.MST_RPC_URL || '',
    // MST Blockchain Chain ID (provided via env)
    chainId: process.env.MST_CHAIN_ID ? parseInt(process.env.MST_CHAIN_ID, 10) : undefined,
    // MachineMandi Smart Contract Address (provided via env)
    contractAddress:
      process.env.MACHINE_MANDI_CONTRACT_ADDRESS ||
      process.env.MST_CONTRACT_ADDRESS ||
      '',
  },
};
