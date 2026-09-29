/**
 * ==============================================================================
 * REAL MST TESTNET DEPLOYMENT SCRIPT — MACHINEMANDI
 * ==============================================================================
 * WARNING: Running this script broadcasts REAL transactions to the MST Testnet
 * and consumes real MST testnet funds.
 *
 * DO NOT execute during prepare/local validation phase.
 * ==============================================================================
 */

import { ethers, artifacts } from "hardhat";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const EXPECTED_CHAIN_ID = 91562037n;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Environment variable ${name} is required but missing.`);
  }
  return value.trim();
}

async function main() {
  console.log("==================================================");
  console.log("=== REAL MST TESTNET TRANSACTION: DEPLOY MACHINEMANDI ===");
  console.log("==================================================");

  // 1 & 2. Verify Chain ID fails closed
  const network = await ethers.provider.getNetwork();
  const envChainIdRaw = requiredEnv("MST_CHAIN_ID");
  const envChainId = BigInt(envChainIdRaw);

  if (network.chainId !== EXPECTED_CHAIN_ID || envChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `CRITICAL SECURITY ABORT: Chain ID mismatch. Connected: ${network.chainId}, Env: ${envChainId}, Required: ${EXPECTED_CHAIN_ID}`
    );
  }

  // 3 & 4. Verify DEPLOYER_PRIVATE_KEY exists without printing or exposing it
  requiredEnv("DEPLOYER_PRIVATE_KEY");

  // 5 & 6. Verify deployer address and balance
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured for network.");
  }

  const deployerAddress = deployer.address;
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log(`Target Network:       MST Testnet`);
  console.log(`Verified Chain ID:    ${network.chainId}`);
  console.log(`Deployer Address:     ${deployerAddress}`);
  console.log(`Deployer Balance:     ${ethers.formatEther(balance)} MST (${balance.toString()} wei)`);

  if (balance === 0n) {
    throw new Error(`Deployer ${deployerAddress} has zero balance. Please fund wallet on MST Testnet before deploying.`);
  }

  // 7. Deploy MachineMandi()
  console.log("\nBroadcasting MachineMandi deployment transaction to MST Testnet...");
  const Factory = await ethers.getContractFactory("MachineMandi", deployer);
  const contract = await Factory.deploy();

  const deployTx = contract.deploymentTransaction();
  if (!deployTx) {
    throw new Error("Failed to capture deployment transaction.");
  }

  console.log(`Deployment TX submitted: ${deployTx.hash}`);

  // 8. Wait for receipt
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error("Transaction confirmed but receipt not returned.");
  }

  // 9 & 10. Capture deployment details and build explorer URL
  const blockNumber = receipt.blockNumber;
  const explorerBase = (process.env.MST_EXPLORER_URL || "https://testnet.mstscan.com").replace(/\/$/, "");
  const explorerTxUrl = `${explorerBase}/tx/${deployTx.hash}`;
  const explorerAddressUrl = `${explorerBase}/address/${contractAddress}`;

  console.log("\n==================================================");
  console.log("=== MACHINEMANDI SUCCESSFULLY DEPLOYED TO MST ===");
  console.log("==================================================");
  console.log(`Contract Address:     ${contractAddress}`);
  console.log(`Transaction Hash:     ${deployTx.hash}`);
  console.log(`Block Number:         ${blockNumber}`);
  console.log(`Chain ID:             ${network.chainId}`);
  console.log(`Deployer Address:     ${deployerAddress}`);
  console.log(`Explorer TX URL:      ${explorerTxUrl}`);
  console.log(`Explorer Address URL: ${explorerAddressUrl}`);
  console.log("==================================================\n");

  // 11. Write/append to deployments/mst-testnet.json without overwriting existing history
  const deploymentsFile = path.resolve(process.cwd(), "deployments", "mst-testnet.json");
  fs.mkdirSync(path.dirname(deploymentsFile), { recursive: true });

  let deploymentHistory: Record<string, unknown> = {};
  if (fs.existsSync(deploymentsFile)) {
    try {
      deploymentHistory = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
    } catch {
      deploymentHistory = {};
    }
  }

  deploymentHistory.network = deploymentHistory.network || "MST Testnet";
  deploymentHistory.chainId = network.chainId.toString();
  deploymentHistory.machineMandi = {
    contractAddress,
    deploymentTx: deployTx.hash,
    blockNumber,
    chainId: network.chainId.toString(),
    deployer: deployerAddress,
    explorer: explorerTxUrl,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(deploymentHistory, null, 2) + "\n");
  console.log(`Deployment metadata recorded in: ${deploymentsFile}`);

  // 12. Export MachineMandi ABI to blockchain/deployments/abi/MachineMandi.json
  const artifact = await artifacts.readArtifact("MachineMandi");
  const abiDir = path.resolve(process.cwd(), "deployments", "abi");
  fs.mkdirSync(abiDir, { recursive: true });
  const abiFile = path.join(abiDir, "MachineMandi.json");
  fs.writeFileSync(abiFile, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`MachineMandi ABI exported to:     ${abiFile}`);
}

main().catch((error) => {
  console.error("\n==================================================");
  console.error("=== DEPLOYMENT FAILED ===");
  console.error("==================================================");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
