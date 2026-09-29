/**
 * ==============================================================================
 * REAL MST TESTNET SMOKE TEST SCRIPT — MACHINEMANDI
 * ==============================================================================
 * WARNING: Running this script broadcasts REAL transactions to the MST Testnet
 * and consumes real MST testnet funds.
 *
 * DO NOT execute during prepare/local validation phase.
 * ==============================================================================
 */

import { ethers } from "hardhat";
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
  console.log("=== REAL MST TESTNET TRANSACTION: MACHINEMANDI SMOKE TEST ===");
  console.log("==================================================");

  // Guard: Fail closed if resume mode is requested
  if (process.env.MACHINE_MANDI_EXISTING_JOB_ID && process.env.MACHINE_MANDI_EXISTING_JOB_ID.trim() !== "") {
    throw new Error(
      "MACHINE_MANDI_EXISTING_JOB_ID is disabled. The smoke test must execute fresh in ONE execution using ONE in-memory device wallet. Please unset MACHINE_MANDI_EXISTING_JOB_ID."
    );
  }

  // 1. Verify chain ID fails closed
  const network = await ethers.provider.getNetwork();
  const envChainIdRaw = requiredEnv("MST_CHAIN_ID");
  const envChainId = BigInt(envChainIdRaw);

  if (network.chainId !== EXPECTED_CHAIN_ID || envChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `CRITICAL SECURITY ABORT: Chain ID mismatch. Connected: ${network.chainId}, Env: ${envChainId}, Required: ${EXPECTED_CHAIN_ID}`
    );
  }

  // 2. Load MachineMandi deployment artifact
  const deploymentsFile = path.resolve(process.cwd(), "deployments", "mst-testnet.json");
  if (!fs.existsSync(deploymentsFile)) {
    throw new Error(`Deployments file not found at ${deploymentsFile}. Deploy MachineMandi first.`);
  }

  const deploymentData = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const contractAddress = deploymentData.machineMandi?.contractAddress;
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error("MachineMandi contract address not found in deployments/mst-testnet.json. Deploy first.");
  }

  console.log(`Connected Chain ID:        ${network.chainId}`);
  console.log(`Target MachineMandi:       ${contractAddress}`);

  // 3. Setup deployer signer (used strictly for owner-only actions & buyer actions in this test)
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured for network.");
  }
  console.log(`Deployer (Owner/Buyer):    ${deployer.address}`);

  const machineMandi = (await ethers.getContractAt("MachineMandi", contractAddress, deployer)) as any;
  const explorerBase = (process.env.MST_EXPLORER_URL || "https://testnet.mstscan.com").replace(/\/$/, "");

  // 4 & 5. Generate ONE fresh temporary in-memory wallet and keep it alive throughout execution
  // NOTE: This private key exists purely in volatile RAM, is NEVER written to disk, and is NEVER printed.
  const temporaryDeviceSigner = ethers.Wallet.createRandom();
  console.log(`Temporary Device Signer:   ${temporaryDeviceSigner.address} [IN-MEMORY TEST DEVICE SIGNER]`);
  console.log("Notice: Key generated in volatile RAM, will remain alive throughout this execution.");

  // 6. Register a NEW test node using deployer/owner
  const testServiceHash = ethers.keccak256(ethers.toUtf8Bytes("MST-SMOKE-TEST-SERVICE-V2"));
  const tinyNonzeroPrice = ethers.parseEther("0.0001"); // 0.0001 MST
  const nonzeroMinDelta = 50n; // Nonzero delta requirement
  const payoutAddress = deployer.address;

  console.log("\n--- STEP 1: Registering NEW Test Node on MST Testnet ---");
  const regTx = await machineMandi.registerNode(
    temporaryDeviceSigner.address,
    payoutAddress,
    testServiceHash,
    tinyNonzeroPrice,
    nonzeroMinDelta
  );
  console.log(`RegisterNode TX submitted: ${regTx.hash}`);
  const regReceipt = await regTx.wait();
  if (!regReceipt) throw new Error("registerNode transaction receipt not received.");
  console.log(`RegisterNode TX confirmed: ${explorerBase}/tx/${regTx.hash} (Block: ${regReceipt.blockNumber})`);

  // 7. Parse NodeRegistered event and obtain NEW nodeId
  const regLog = regReceipt.logs
    .map((log: any) => {
      try {
        return machineMandi.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "NodeRegistered");

  if (!regLog) throw new Error("NodeRegistered event not found in transaction logs.");
  const newNodeId = BigInt(regLog.args[0]);
  console.log(`Registered Node ID:        ${newNodeId}`);

  // 8. Create a NEW short-deadline job for that NEW node
  const latestBlock = await ethers.provider.getBlock("latest");
  const currentBlockTime = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
  const deadline = currentBlockTime + 1800n; // 30 minutes in future

  console.log("\n--- STEP 2: Creating NEW Escrow Job on MST Testnet ---");
  const createJobTx = await machineMandi.createJob(newNodeId, deadline, { value: tinyNonzeroPrice });
  console.log(`CreateJob TX submitted:    ${createJobTx.hash}`);
  const createJobReceipt = await createJobTx.wait();
  if (!createJobReceipt) throw new Error("createJob transaction receipt not received.");
  console.log(`CreateJob TX confirmed:    ${explorerBase}/tx/${createJobTx.hash} (Block: ${createJobReceipt.blockNumber})`);

  // 9. Parse JobCreated event and obtain NEW jobId
  const jobLog = createJobReceipt.logs
    .map((log: any) => {
      try {
        return machineMandi.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "JobCreated");

  if (!jobLog) throw new Error("JobCreated event not found in transaction logs.");
  const newJobId = BigInt(jobLog.args[0]);
  console.log(`Created Job ID:            ${newJobId}`);

  // 10 & 11. Read getJob(newJobId) from chain and confirm fields
  console.log("\n--- STEP 3: Reading and Validating Job State from Chain ---");
  const job = await machineMandi.getJob(newJobId);
  const statusNum = Number(job.status ?? job[6]);
  const jobNodeId = BigInt(job.nodeId ?? job[0]);
  const nonce = BigInt(job.nonce ?? job[5]);
  const jobSigner = (job.signer ?? job[9]) as string;
  const jobPayout = (job.payout ?? job[10]) as string;
  const jobServiceHash = (job.serviceHash ?? job[11]) as string;
  const jobMinDelta = BigInt(job.minDelta ?? job[12]);

  console.log(`Job Status (0=OPEN):       ${statusNum}`);
  console.log(`Job Node ID:               ${jobNodeId}`);
  console.log(`Job Nonce:                 ${nonce}`);
  console.log(`Job Signer:                ${jobSigner}`);
  console.log(`Job Payout:                ${jobPayout}`);
  console.log(`Job Service Hash:          ${jobServiceHash}`);
  console.log(`Job Min Delta:             ${jobMinDelta}`);

  if (statusNum !== 0) {
    throw new Error(`Unexpected job status: ${statusNum}, expected 0 (OPEN).`);
  }
  if (jobNodeId !== newNodeId) {
    throw new Error(`Node ID mismatch! Expected: ${newNodeId}, Job reports: ${jobNodeId}`);
  }
  if (jobSigner.toLowerCase() !== temporaryDeviceSigner.address.toLowerCase()) {
    throw new Error(`Signer mismatch! Expected: ${temporaryDeviceSigner.address}, Job reports: ${jobSigner}`);
  }
  if (jobPayout.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Payout mismatch! Expected: ${deployer.address}, Job reports: ${jobPayout}`);
  }
  if (jobServiceHash !== testServiceHash) {
    throw new Error(`Service hash mismatch! Expected: ${testServiceHash}, Job reports: ${jobServiceHash}`);
  }
  if (jobMinDelta !== nonzeroMinDelta) {
    throw new Error(`Min delta mismatch! Expected: ${nonzeroMinDelta}, Job reports: ${jobMinDelta}`);
  }

  // 12. Construct the exact EIP-712 domain
  const domain = {
    name: "MachineMandi",
    version: "1",
    chainId: EXPECTED_CHAIN_ID,
    verifyingContract: contractAddress,
  };

  // 13. Construct the exact WorkProof typed data
  const types = {
    WorkProof: [
      { name: "jobId", type: "uint256" },
      { name: "nodeId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "startedAt", type: "uint256" },
      { name: "completedAt", type: "uint256" },
      { name: "preReading", type: "uint256" },
      { name: "postReading", type: "uint256" },
      { name: "serviceHash", type: "bytes32" },
    ],
  };

  const startedAt = currentBlockTime + 10n;
  const completedAt = currentBlockTime + 30n;
  const preReading = 0n;
  const postReading = jobMinDelta + 100n; // minDelta + sufficient positive delta (e.g. 150)

  const workProof = {
    jobId: newJobId,
    nodeId: newNodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    serviceHash: jobServiceHash,
  };

  // 14 & 15. Sign with the SAME temporaryDeviceSigner and serialize using ethers v6
  console.log("\n--- STEP 4: Signing EIP-712 WorkProof with IN-MEMORY TEST DEVICE SIGNER ---");
  const rawSignature = await temporaryDeviceSigner.signTypedData(domain, types, workProof);
  const signature = ethers.Signature.from(rawSignature).serialized;
  console.log(`Generated EIP-712 Serialized Signature (65 bytes): ${signature.slice(0, 18)}... (Length: ${signature.length})`);

  // 16. Submit proof on MST Testnet
  console.log("\n--- STEP 5: Submitting Work Proof to MST Testnet ---");
  const submitTx = await machineMandi.submitProof(
    newJobId,
    newNodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    jobServiceHash,
    signature
  );
  console.log(`SubmitProof TX submitted:  ${submitTx.hash}`);
  const submitReceipt = await submitTx.wait();
  if (!submitReceipt) throw new Error("submitProof transaction receipt not received.");
  console.log(`SubmitProof TX confirmed:  ${explorerBase}/tx/${submitTx.hash} (Block: ${submitReceipt.blockNumber})`);

  // 17, 18 & 19. Read getJob(newJobId) and verify status == 1, preValue, postValue
  console.log("\n--- STEP 6: Verifying Job Completion and Event on Chain ---");
  const finalJob = await machineMandi.getJob(newJobId);
  const finalStatusNum = Number(finalJob.status ?? finalJob[6]);
  const finalPreValue = BigInt(finalJob.preValue ?? finalJob[7]);
  const finalPostValue = BigInt(finalJob.postValue ?? finalJob[8]);

  console.log(`Final Job Status (1=COMPLETED): ${finalStatusNum}`);
  console.log(`Final Recorded PreReading:      ${finalPreValue}`);
  console.log(`Final Recorded PostReading:     ${finalPostValue}`);

  if (finalStatusNum !== 1) {
    throw new Error(`Job verification failed! Expected status 1 (COMPLETED), got: ${finalStatusNum}`);
  }
  if (finalPreValue !== preReading) {
    throw new Error(`PreValue mismatch! Expected: ${preReading}, got: ${finalPreValue}`);
  }
  if (finalPostValue !== postReading) {
    throw new Error(`PostValue mismatch! Expected: ${postReading}, got: ${finalPostValue}`);
  }

  // 20. Verify JobCompleted event was emitted
  const completedLog = submitReceipt.logs
    .map((log: any) => {
      try {
        return machineMandi.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e?.name === "JobCompleted");

  if (!completedLog) throw new Error("JobCompleted event not found in submitProof logs.");
  const recoveredSignerInEvent = completedLog.args[7] as string;
  console.log(`JobCompleted Event Emitted: recoveredSigner=${recoveredSignerInEvent}`);

  if (recoveredSignerInEvent.toLowerCase() !== temporaryDeviceSigner.address.toLowerCase()) {
    throw new Error(`Event recoveredSigner mismatch! Expected: ${temporaryDeviceSigner.address}, got: ${recoveredSignerInEvent}`);
  }

  // 21. Print all transaction hashes and MSTScan explorer URLs
  console.log("\n==================================================");
  console.log("=== MST TESTNET SMOKE TEST: ALL CHECKS PASSED ===");
  console.log("==================================================");
  console.log(`Contract:                  ${contractAddress}`);
  console.log(`Registered Node ID:        ${newNodeId}`);
  console.log(`Created Job ID:            ${newJobId}`);
  console.log(`RegisterNode TX:           ${regTx.hash}`);
  console.log(`RegisterNode Explorer:     ${explorerBase}/tx/${regTx.hash}`);
  console.log(`CreateJob TX:              ${createJobTx.hash}`);
  console.log(`CreateJob Explorer:        ${explorerBase}/tx/${createJobTx.hash}`);
  console.log(`SubmitProof TX:            ${submitTx.hash}`);
  console.log(`SubmitProof Explorer:      ${explorerBase}/tx/${submitTx.hash}`);
  console.log(`Job Settlement:            COMPLETED`);
  console.log("==================================================");
}

main().catch((error) => {
  console.error("\n==================================================");
  console.error("=== SMOKE TEST FAILED ===");
  console.error("==================================================");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
