import { ethers } from 'ethers';
import { config } from '../config';
import {
  getEip712Domain,
  WORK_PROOF_EIP712_TYPES,
  EXPECTED_MST_CHAIN_ID,
  DEFAULT_CONTRACT_ADDRESS,
} from '../blockchain/mstContract';
import MachineMandiArtifact from '../blockchain/abi/MachineMandi.json';
import { DeviceProof } from '../types';

export const NODE1_ID = 1;
export const NODE1_REGISTERED_SIGNER = '0xAa0A3DC02cDc7d5e2d108DabD096C1822bc0E8b8';
export const NODE1_DEFAULT_SERVICE_HASH =
  '0x15f855c600d7ad49d2e3f53d29bf304db887e114d99057b7a40a94e8ed7acb26';
export const NODE1_MIN_DELTA = 50;

export interface DemoProofOptions {
  jobId: number;
  nodeId?: number;
  nonce?: number;
  startedAt?: number;
  completedAt?: number;
  preReading?: number;
  postReading?: number;
  serviceHash?: string;
  privateKey: string;
  chainId?: number;
  verifyingContract?: string;
}

export interface DemoProofPayload extends DeviceProof {
  recoveredSigner: string;
}

export interface DemoSimulatorOptions {
  jobId: number;
  privateKey?: string;
  backendUrl?: string;
  rpcUrl?: string;
  contractAddress?: string;
  chainId?: number;
  preReading?: number;
  postReading?: number;
  silent?: boolean;
}

export interface DemoSimulatorResult {
  jobId: number;
  nodeId: number;
  nonce: number;
  startedAt: number;
  completedAt: number;
  preReading: number;
  postReading: number;
  delta: number;
  serviceHash: string;
  recoveredSigner: string;
  backendStatus: number;
  backendResponse: any;
  txHash?: string;
  success: boolean;
}

/**
 * Constructs and signs a valid EIP-712 WorkProof for Node #1 without exposing private keys.
 */
export async function createDemoWorkProof(options: DemoProofOptions): Promise<DemoProofPayload> {
  const {
    jobId,
    nodeId = NODE1_ID,
    nonce = 0,
    startedAt = Math.floor(Date.now() / 1000) - 30,
    completedAt = Math.floor(Date.now() / 1000),
    preReading = 100,
    postReading = 160,
    serviceHash = NODE1_DEFAULT_SERVICE_HASH,
    privateKey,
    chainId = config.relayer.chainId || EXPECTED_MST_CHAIN_ID,
    verifyingContract = config.relayer.contractAddress || DEFAULT_CONTRACT_ADDRESS,
  } = options;

  if (typeof jobId !== 'number' || !Number.isInteger(jobId) || jobId <= 0) {
    throw new Error('Invalid jobId: must be a positive integer');
  }

  if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId <= 0) {
    throw new Error('Invalid nodeId: must be a positive integer');
  }

  if (typeof nonce !== 'number' || !Number.isInteger(nonce) || nonce < 0) {
    throw new Error('Invalid nonce: must be a non-negative integer');
  }

  if (postReading <= preReading) {
    throw new Error(`Invalid readings: postReading (${postReading}) must be greater than preReading (${preReading})`);
  }

  const delta = postReading - preReading;
  if (delta < NODE1_MIN_DELTA) {
    throw new Error(`Insufficient delta: delta (${delta}) is less than Node #1 minimum delta (${NODE1_MIN_DELTA})`);
  }

  if (completedAt < startedAt) {
    throw new Error(`Timing error: completedAt (${completedAt}) cannot be earlier than startedAt (${startedAt})`);
  }

  if (!privateKey || typeof privateKey !== 'string' || privateKey.trim() === '') {
    throw new Error('DEMO_DEVICE_PRIVATE_KEY is required to sign the work proof.');
  }

  const wallet = new ethers.Wallet(privateKey.trim());
  const domain = getEip712Domain(chainId, verifyingContract);

  const values = {
    jobId: BigInt(jobId),
    nodeId: BigInt(nodeId),
    nonce: BigInt(nonce),
    startedAt: BigInt(startedAt),
    completedAt: BigInt(completedAt),
    preReading: BigInt(Math.round(preReading)),
    postReading: BigInt(Math.round(postReading)),
    serviceHash: serviceHash.trim(),
  };

  const signature = await wallet.signTypedData(domain, WORK_PROOF_EIP712_TYPES, values);
  const recoveredSigner = ethers.verifyTypedData(domain, WORK_PROOF_EIP712_TYPES, values, signature);

  return {
    jobId,
    nodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    preMoisture: preReading,
    postMoisture: postReading,
    serviceHash,
    signature,
    recoveredSigner,
  };
}

/**
 * Runs the end-to-end demo device simulator flow:
 * 1. Read job ID.
 * 2. Fetch job info from backend (GET /api/device/job/:jobId).
 * 3. Obtain on-chain job info using project architecture.
 * 4. Generate sensor readings (100 -> 160).
 * 5. Ensure delta >= minimum delta (50).
 * 6 & 7. Construct EIP-712 WorkProof with exact schema and domain.
 * 8. Sign using DEMO_DEVICE_PRIVATE_KEY and verify recovered signer.
 * 9. Submit proof to backend (POST /api/device/proof).
 * 10. Print concise result.
 */
export async function runDemoSimulator(options: DemoSimulatorOptions): Promise<DemoSimulatorResult> {
  const { jobId, silent = false } = options;

  if (!jobId || isNaN(jobId) || jobId <= 0) {
    throw new Error('Please provide a valid positive integer jobId (e.g., npm run demo:proof -- 4)');
  }

  const backendUrl = (options.backendUrl || process.env.BACKEND_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
  const rpcUrl = options.rpcUrl || config.relayer.rpcUrl || 'https://testnetrpc.mstblockchain.com';
  const contractAddress = options.contractAddress || config.relayer.contractAddress || DEFAULT_CONTRACT_ADDRESS;
  const chainId = options.chainId || config.relayer.chainId || EXPECTED_MST_CHAIN_ID;
  const privateKey = options.privateKey || process.env.DEMO_DEVICE_PRIVATE_KEY;

  if (!privateKey || privateKey.trim() === '') {
    throw new Error(
      'Missing DEMO_DEVICE_PRIVATE_KEY environment variable.\n' +
      'Please set DEMO_DEVICE_PRIVATE_KEY in your backend/.env file.\n' +
      'This key must correspond to the registered Node #1 signer (0xAa0A3DC02cDc7d5e2d108DabD096C1822bc0E8b8).'
    );
  }

  // 1. Fetch job info from backend
  let backendJob: any = null;
  try {
    const res = await fetch(`${backendUrl}/api/device/job/${jobId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.job) {
        backendJob = data.job;
      }
    }
  } catch (err: any) {
    // If backend is unreachable, throw clear error
    throw new Error(`Failed to connect to backend at ${backendUrl}: ${err.message}. Please ensure the backend is running.`);
  }

  // 2. Obtain on-chain job / node information using project architecture
  let onChainJob: any = null;
  let onChainNode: any = null;

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const contract = new ethers.Contract(contractAddress, MachineMandiArtifact, provider);

    const [rawJob, rawNode] = await Promise.all([
      contract.getJob(BigInt(jobId)).catch(() => null),
      contract.getNode(BigInt(NODE1_ID)).catch(() => null),
    ]);

    if (rawJob && (rawJob.nodeId !== 0n || rawJob[0] !== 0n)) {
      onChainJob = {
        nodeId: Number(rawJob.nodeId ?? rawJob[0]),
        buyer: String(rawJob.buyer ?? rawJob[1]),
        amount: String(rawJob.amount ?? rawJob[2]),
        createdAt: Number(rawJob.createdAt ?? rawJob[3]),
        deadline: Number(rawJob.deadline ?? rawJob[4]),
        nonce: Number(rawJob.nonce ?? rawJob[5]),
        status: Number(rawJob.status ?? rawJob[6]),
        signer: String(rawJob.signer ?? rawJob[9]),
        serviceHash: String(rawJob.serviceHash ?? rawJob[11]),
        minDelta: Number(rawJob.minDelta ?? rawJob[12]),
      };
    }

    if (rawNode) {
      onChainNode = {
        signer: String(rawNode.signer ?? rawNode[0]),
        serviceHash: String(rawNode.serviceHash ?? rawNode[2]),
        minDelta: Number(rawNode.minDelta ?? rawNode[4]),
        active: Boolean(rawNode.active ?? rawNode[5]),
      };
    }
  } catch {
    // Graceful fallback to backendJob or defaults if RPC is offline
  }

  // Resolve job parameters
  const nodeId = onChainJob?.nodeId ?? backendJob?.nodeId ?? NODE1_ID;
  const nonce = onChainJob?.nonce ?? backendJob?.nonce ?? jobId;
  const serviceHash = onChainJob?.serviceHash ?? onChainNode?.serviceHash ?? NODE1_DEFAULT_SERVICE_HASH;
  const minDelta = onChainJob?.minDelta ?? onChainNode?.minDelta ?? NODE1_MIN_DELTA;
  const deadline = onChainJob?.deadline ?? backendJob?.deadline ?? Math.floor(Date.now() / 1000) + 3600;

  // 3 & 4. Sensor readings
  const preReading = options.preReading ?? 100;
  const postReading = options.postReading ?? 160;
  const delta = postReading - preReading;

  if (delta < minDelta) {
    throw new Error(`Insufficient delta: ${delta} is less than required minimum delta ${minDelta}`);
  }

  // Calculate timing within deadline
  const nowEpoch = Math.floor(Date.now() / 1000);
  const completedAt = Math.min(nowEpoch, deadline > 0 ? deadline - 10 : nowEpoch);
  const startedAt = completedAt - 30;

  // 5 & 6 & 7. Construct and sign EIP-712 WorkProof
  const proof = await createDemoWorkProof({
    jobId,
    nodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    serviceHash,
    privateKey,
    chainId,
    verifyingContract: contractAddress,
  });

  // Verify recovered signer
  if (proof.recoveredSigner.toLowerCase() !== NODE1_REGISTERED_SIGNER.toLowerCase()) {
    if (!silent) {
      console.warn(
        `[WARNING] Recovered signer (${proof.recoveredSigner}) does not match Node #1 registered signer (${NODE1_REGISTERED_SIGNER}).`
      );
    }
  }

  // 8. Submit generated proof to backend: POST /api/device/proof
  const postBody = {
    jobId: proof.jobId,
    nodeId: proof.nodeId,
    nonce: proof.nonce,
    startedAt: proof.startedAt,
    completedAt: proof.completedAt,
    preReading: proof.preReading,
    postReading: proof.postReading,
    serviceHash: proof.serviceHash,
    signature: proof.signature,
  };

  const response = await fetch(`${backendUrl}/api/device/proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody),
  });

  const responseBody = await response.json();
  const txHash = responseBody.txHash || undefined;

  const result: DemoSimulatorResult = {
    jobId,
    nodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    delta,
    serviceHash,
    recoveredSigner: proof.recoveredSigner,
    backendStatus: response.status,
    backendResponse: responseBody,
    txHash,
    success: response.ok && responseBody.success === true,
  };

  // 9. Print concise result
  if (!silent) {
    console.log('\n==================================================');
    console.log(' MachineMandi Demo Device Simulator (Node #1)     ');
    console.log('==================================================');
    console.log(`Job ID:                   ${result.jobId}`);
    console.log(`Node ID:                  ${result.nodeId}`);
    console.log(`Pre reading:              ${result.preReading}`);
    console.log(`Post reading:             ${result.postReading}`);
    console.log(`Delta:                    ${result.delta} (minimum required: ${minDelta})`);
    console.log(`Recovered signer:         ${result.recoveredSigner}`);
    console.log(`Backend response:         HTTP ${result.backendStatus} — ${responseBody.message || responseBody.error || JSON.stringify(responseBody)}`);
    console.log(`Relayer transaction hash: ${result.txHash || 'N/A'}`);
    console.log('==================================================\n');
  }

  return result;
}

// CLI entrypoint if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  let targetJobId = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--job' || arg === '-j' || arg === '--jobId') {
      targetJobId = parseInt(args[i + 1], 10);
      break;
    }
    if (arg.startsWith('--job=') || arg.startsWith('--jobId=')) {
      targetJobId = parseInt(arg.split('=')[1], 10);
      break;
    }
    const num = parseInt(arg, 10);
    if (!isNaN(num) && num > 0) {
      targetJobId = num;
      break;
    }
  }

  if (!targetJobId || isNaN(targetJobId) || targetJobId <= 0) {
    console.error('Usage: npm run demo:proof -- <jobId>');
    console.error('Example: npm run demo:proof -- 4');
    process.exit(1);
  }

  runDemoSimulator({ jobId: targetJobId })
    .then((res) => {
      if (!res.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`\n[DEMO SIMULATOR ERROR]: ${err.message}\n`);
      process.exit(1);
    });
}
