import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Check blockchain/.env.`);
  return value;
}

async function main() {
  const rpcUrl = required("MST_RPC_URL");
  const expectedChainId = BigInt(required("MST_CHAIN_ID"));
  const walletKey = required("DEPLOYER_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const latestBlock = await provider.getBlockNumber();
  const wallet = new ethers.Wallet(walletKey, provider);
  const balance = await provider.getBalance(wallet.address);

  let gasPrice = "unavailable";
  try {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice !== null) gasPrice = feeData.gasPrice.toString();
  } catch {}

  console.log("=== MST NETWORK CHECK ===");
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Expected Chain ID: ${expectedChainId}`);
  console.log(`Latest Block: ${latestBlock}`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance (wei): ${balance}`);
  console.log(`Gas Price (wei): ${gasPrice}`);

  if (network.chainId !== expectedChainId) {
    throw new Error(`CHAIN ID MISMATCH: ${network.chainId} != ${expectedChainId}`);
  }

  console.log("Connection: PASS");
  console.log("Chain ID: PASS");
  console.log("RESULT: PASS");
}

main().catch((error) => {
  console.error("RESULT: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
