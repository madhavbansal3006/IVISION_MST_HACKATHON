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
  // A. Connect to MST Testnet & B. Verify chain ID is exactly 91562037
  const expectedChainId = BigInt(process.env.MST_CHAIN_ID || "91562037");
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== 91562037n || network.chainId !== expectedChainId) {
    throw new Error(
      `CHAIN ID MISMATCH: Connected chain ID ${network.chainId} does not match expected 91562037.`
    );
  }

  // C. Get the configured deployer signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured for mstTestnet network.");
  }

  console.log("=== INITIATING MST TESTNET ECRECOVER PROBE ===");
  console.log(`Connected to Chain ID: ${network.chainId}`);
  console.log(`Deployer Address:      ${deployer.address}`);

  // D. Deploy EcrecoverProbe to MST Testnet
  const Factory = await ethers.getContractFactory("EcrecoverProbe", deployer);
  console.log("Deploying EcrecoverProbe contract to MST Testnet...");
  const probe = await Factory.deploy();

  const deployTx = probe.deploymentTransaction();
  if (!deployTx) {
    throw new Error("Deployment transaction could not be created.");
  }
  console.log(`Deployment transaction submitted: ${deployTx.hash}`);

  // E. Wait for deployment
  await probe.waitForDeployment();
  const probeAddress = await probe.getAddress();
  const deployReceipt = await deployTx.wait();
  if (!deployReceipt) {
    throw new Error("Deployment receipt not received.");
  }
  console.log(`EcrecoverProbe deployed at: ${probeAddress} in block ${deployReceipt.blockNumber}`);

  // F. Create a temporary ethers Wallet in memory
  // NOTE: This key exists solely in volatile memory, is never persisted to disk, and is never logged.
  const tempWallet = ethers.Wallet.createRandom();
  const expectedSigner = tempWallet.address;

  // G. Construct a deterministic test message
  const testMessage = "MachineMandi:MST-Testnet:EcrecoverProbe:DeviceVerification";

  // H. Hash it to a bytes32 digest
  // We compute keccak256 over the UTF-8 encoded test message
  const messageBytes = ethers.toUtf8Bytes(testMessage);
  const digest = ethers.keccak256(messageBytes);

  // I. Sign exactly that digest using the temporary wallet in a way compatible with Solidity ecrecover
  // In ethers v6, signingKey.sign(digest) executes raw ECDSA secp256k1 signing directly over the 32-byte digest
  // without prepending the "\x19Ethereum Signed Message:\n32" prefix.
  const signature = tempWallet.signingKey.sign(digest);

  // J. Extract r, s, and v from the ethers signature
  const r = signature.r;
  const s = signature.s;
  const v = signature.v; // In ethers v6, v is normalized to 27 or 28

  // K. Inspect returned values via staticCall & call deployed EcrecoverProbe on-chain
  const [isMatchStatic, recoveredAddressStatic] = await probe.verifySignature.staticCall(
    expectedSigner,
    digest,
    v,
    r,
    s
  );

  console.log("Submitting verifySignature transaction on MST Testnet...");
  const tx = await probe.verifySignature(
    expectedSigner,
    digest,
    v,
    r,
    s
  );

  // L. Wait for the transaction
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("verifySignature transaction failed on MST Testnet.");
  }

  // M. Read/verify the returned recovered address
  const recoveredAddress = recoveredAddressStatic;

  // N. Verify recovered address exactly equals temporary wallet address
  if (!isMatchStatic || recoveredAddress.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error(
      `Recovered address mismatch! Expected: ${expectedSigner}, Recovered: ${recoveredAddress}`
    );
  }

  // O. Verify the emitted event
  const event = receipt.logs.map((log: unknown) => {
    try {
      return probe.interface.parseLog(log as any);
    } catch {
      return null;
    }
  }).find((parsed: ReturnType<typeof probe.interface.parseLog>) => parsed?.name === "SignatureVerified");

  if (!event) {
    throw new Error("SignatureVerified event was not emitted in receipt logs.");
  }

  const eventExpected = event.args[0] as string;
  const eventRecovered = event.args[1] as string;

  if (eventExpected.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error(
      `Event expectedSigner mismatch! Event: ${eventExpected}, Expected: ${expectedSigner}`
    );
  }
  if (eventRecovered.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error(
      `Event recoveredSigner mismatch! Event: ${eventRecovered}, Expected: ${expectedSigner}`
    );
  }

  // Explorer URLs
  const explorerBase = process.env.MST_EXPLORER_URL || "https://testnet.mstscan.com";
  const explorerBaseClean = explorerBase.replace(/\/$/, "");
  const deployTxUrl = `${explorerBaseClean}/tx/${deployTx.hash}`;
  const verifyTxUrl = `${explorerBaseClean}/tx/${tx.hash}`;

  // Update existing deployment artifact preserving mstTest section
  const deploymentFile = path.resolve(process.cwd(), "deployments", "mst-testnet.json");
  fs.mkdirSync(path.dirname(deploymentFile), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(deploymentFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    } catch {
      existing = {};
    }
  }

  existing.network = existing.network || "MST Testnet";
  existing.chainId = existing.chainId || network.chainId.toString();

  const probeArtifact = {
    contractAddress: probeAddress,
    deploymentTx: deployTx.hash,
    blockNumber: deployReceipt.blockNumber,
    deployer: deployer.address,
    explorer: deployTxUrl
  };

  existing.ecrecoverProbe = probeArtifact;
  existing.EcrecoverProbe = probeArtifact;

  fs.writeFileSync(deploymentFile, JSON.stringify(existing, null, 2) + "\n");

  // P & Q. Print clear PASS result and detailed outputs
  console.log("\n==================================================");
  console.log("=== MST TESTNET ECRECOVER PROBE: PASS ===");
  console.log("==================================================");
  console.log(`Chain ID:                      ${network.chainId}`);
  console.log(`Temporary Signer (Public):     ${expectedSigner}`);
  console.log(`Probe Contract Address:        ${probeAddress}`);
  console.log(`Deployment TX Hash:            ${deployTx.hash}`);
  console.log(`Deployment Block:              ${deployReceipt.blockNumber}`);
  console.log(`Deployment Explorer URL:       ${deployTxUrl}`);
  console.log(`Verification TX Hash:          ${tx.hash}`);
  console.log(`Verification Block:            ${receipt.blockNumber}`);
  console.log(`Recovered Address:             ${recoveredAddress}`);
  console.log(`Expected Address:              ${expectedSigner}`);
  console.log(`Verification Explorer URL:     ${verifyTxUrl}`);
  console.log(`Match Verified:                true (PASS)`);
  console.log(`Event Log Verified:            true (PASS)`);
  console.log("==================================================");
}

main().catch((error) => {
  console.log("\n==================================================");
  console.log("=== MST TESTNET ECRECOVER PROBE: FAIL ===");
  console.log("==================================================");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
