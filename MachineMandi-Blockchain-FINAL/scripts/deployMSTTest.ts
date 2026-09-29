import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

async function main() {
  const expectedChainId = BigInt(required("MST_CHAIN_ID"));
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== expectedChainId) {
    throw new Error(`CHAIN ID MISMATCH: ${network.chainId} != ${expectedChainId}`);
  }

  const [deployer] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("MSTTest");
  const contract = await Factory.deploy();
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("Deployment transaction was not created.");

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Deployment receipt was not returned.");

  const file = path.resolve(process.cwd(), "deployments", "mst-testnet.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    existing = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  const explorer = process.env.MST_EXPLORER_URL || null;
  existing.network ??= "MST Testnet";
  existing.chainId ??= network.chainId.toString();
  existing.mstTest = {
    contractAddress: address,
    deploymentTx: tx.hash,
    blockNumber: receipt.blockNumber,
    deployer: deployer.address,
    explorer
  };

  fs.writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");

  console.log("=== MST TEST DEPLOYED ===");
  console.log(`Contract: ${address}`);
  console.log(`Deployment TX: ${tx.hash}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Explorer: ${explorer ? explorer.replace(/\/$/, "") + "/tx/" + tx.hash : "TODO — VERIFY WITH MST"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
