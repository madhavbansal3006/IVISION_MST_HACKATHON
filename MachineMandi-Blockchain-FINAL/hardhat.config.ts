import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import * as dotenv from "dotenv";

dotenv.config();

const rpcUrl = process.env.MST_RPC_URL;
const chainIdRaw = process.env.MST_CHAIN_ID;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {},
    ...(rpcUrl && chainId && deployerKey
      ? {
          mstTestnet: {
            url: rpcUrl,
            chainId,
            accounts: [deployerKey],
          },
        }
      : {}),
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
