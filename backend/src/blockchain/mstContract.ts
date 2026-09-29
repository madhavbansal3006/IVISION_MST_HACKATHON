import { ethers } from 'ethers';
import {
  DeviceProof,
  BlockchainService,
  JobCreatedEvent,
  OnChainJob,
  ON_CHAIN_JOB_STATUS,
} from '../types';
import { config } from '../config';
import MachineMandiArtifact from './abi/MachineMandi.json';

export const EXPECTED_MST_CHAIN_ID = 91562037;
export const DEFAULT_CONTRACT_ADDRESS = '0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE';

/**
 * EIP-712 Domain and Type definitions for MachineMandi WorkProof
 */
export function getEip712Domain(chainId: number | bigint, verifyingContract: string) {
  return {
    name: 'MachineMandi',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

export const WORK_PROOF_EIP712_TYPES = {
  WorkProof: [
    { name: 'jobId', type: 'uint256' },
    { name: 'nodeId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'startedAt', type: 'uint256' },
    { name: 'completedAt', type: 'uint256' },
    { name: 'preReading', type: 'uint256' },
    { name: 'postReading', type: 'uint256' },
    { name: 'serviceHash', type: 'bytes32' },
  ],
};

/**
 * Pre-flight local validation and EIP-712 signature verification.
 * Runs before broadcasting submitProof() to save gas and detect invalid proofs early.
 */
export function validateProofPreFlight(
  proof: DeviceProof,
  job: OnChainJob,
  chainId: number | bigint,
  verifyingContract: string
): { valid: boolean; recoveredSigner: string } {
  // 1. Signature length check: 65 bytes = 130 hex characters + '0x' = 132 chars
  if (
    typeof proof.signature !== 'string' ||
    proof.signature.length !== 132 ||
    !/^0x[0-9a-fA-F]{130}$/.test(proof.signature)
  ) {
    throw new Error(
      `Invalid signature length: expected 65-byte serialized signature (132 hex characters), got ${proof.signature?.length || 0}`
    );
  }

  // 2. Job status check
  if (job.status !== ON_CHAIN_JOB_STATUS.OPEN) {
    throw new Error(
      `Job is not open on-chain: current status is ${job.status} (expected OPEN = 0)`
    );
  }

  // 3. Identifiers match
  if (BigInt(proof.nodeId) !== job.nodeId) {
    throw new Error(
      `Node ID mismatch: proof nodeId (${proof.nodeId}) does not match job nodeId (${job.nodeId})`
    );
  }

  if (BigInt(proof.nonce) !== job.nonce) {
    throw new Error(
      `Nonce mismatch: proof nonce (${proof.nonce}) does not match job nonce (${job.nonce})`
    );
  }

  if (proof.serviceHash.toLowerCase() !== job.serviceHash.toLowerCase()) {
    throw new Error(
      `Service hash mismatch: proof hash (${proof.serviceHash}) does not match job hash (${job.serviceHash})`
    );
  }

  // 4. Timestamps
  const startedAt = BigInt(proof.startedAt);
  const completedAt = BigInt(proof.completedAt);

  if (completedAt < startedAt) {
    throw new Error(
      `Invalid timestamps: completedAt (${proof.completedAt}) cannot be earlier than startedAt (${proof.startedAt})`
    );
  }

  if (completedAt > job.deadline) {
    throw new Error(
      `Job deadline expired: completedAt (${proof.completedAt}) exceeds deadline (${job.deadline})`
    );
  }

  // 5. Sensor readings and delta
  const preReadingVal = proof.preReading !== undefined ? proof.preReading : proof.preMoisture;
  const postReadingVal = proof.postReading !== undefined ? proof.postReading : proof.postMoisture;

  if (preReadingVal === undefined || postReadingVal === undefined) {
    throw new Error('Sensor readings missing in proof: preReading and postReading must be provided');
  }

  const preReading = BigInt(Math.round(preReadingVal));
  const postReading = BigInt(Math.round(postReadingVal));

  if (postReading <= preReading) {
    throw new Error(
      `Invalid readings: postReading (${postReading}) must be greater than preReading (${preReading})`
    );
  }

  const delta = postReading - preReading;
  if (delta < job.minDelta) {
    throw new Error(
      `Insufficient delta: reading delta (${delta}) is less than required minDelta (${job.minDelta})`
    );
  }

  // 6. Cryptographic EIP-712 signature verification
  const domain = getEip712Domain(chainId, verifyingContract);

  const values = {
    jobId: BigInt(proof.jobId),
    nodeId: BigInt(proof.nodeId),
    nonce: BigInt(proof.nonce),
    startedAt,
    completedAt,
    preReading,
    postReading,
    serviceHash: proof.serviceHash,
  };

  let recoveredSigner: string;
  try {
    recoveredSigner = ethers.verifyTypedData(
      domain,
      WORK_PROOF_EIP712_TYPES,
      values,
      proof.signature
    );
  } catch (err: any) {
    throw new Error(`EIP-712 recovery failed: ${err.message}`);
  }

  if (recoveredSigner.toLowerCase() !== job.signer.toLowerCase()) {
    throw new Error(
      `Signature mismatch: recovered signer ${recoveredSigner} does not match node registered signer ${job.signer}`
    );
  }

  return { valid: true, recoveredSigner };
}

/**
 * Real MST Blockchain Adapter using ethers v6
 */
export class MstBlockchainService implements BlockchainService {
  readonly mode = 'live' as const;

  private provider: ethers.JsonRpcProvider | null = null;
  private relayerWallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private listenerCallback: ((event: JobCreatedEvent) => void | Promise<void>) | null = null;

  private readonly expectedChainId: number;
  private readonly contractAddress: string;
  private readonly rpcUrl: string;
  private readonly privateKey: string;

  constructor(options?: {
    provider?: ethers.JsonRpcProvider;
    relayerWallet?: ethers.Wallet;
    contract?: ethers.Contract;
    rpcUrl?: string;
    contractAddress?: string;
    privateKey?: string;
    chainId?: number;
  }) {
    this.expectedChainId = options?.chainId || config.relayer.chainId || EXPECTED_MST_CHAIN_ID;
    this.contractAddress =
      options?.contractAddress !== undefined
        ? options.contractAddress
        : config.relayer.contractAddress || DEFAULT_CONTRACT_ADDRESS;
    this.rpcUrl = options?.rpcUrl !== undefined ? options.rpcUrl : config.relayer.rpcUrl;
    this.privateKey = options?.privateKey !== undefined ? options.privateKey : config.relayer.privateKey;

    if (options?.provider) this.provider = options.provider;
    if (options?.relayerWallet) this.relayerWallet = options.relayerWallet;
    if (options?.contract) this.contract = options.contract;
  }

  /**
   * Initializes and validates provider connection, network chainId, and relayer wallet.
   */
  async ensureInitialized(): Promise<{
    provider: ethers.JsonRpcProvider;
    relayerWallet: ethers.Wallet;
    contract: ethers.Contract;
  }> {
    if (!this.rpcUrl) {
      throw new Error(
        'Live MST Adapter configuration error: MST_RPC_URL is missing in environment.'
      );
    }

    if (!this.contractAddress) {
      throw new Error(
        'Live MST Adapter configuration error: MACHINE_MANDI_CONTRACT_ADDRESS is missing in environment.'
      );
    }

    if (!this.privateKey) {
      throw new Error(
        'Live MST Adapter configuration error: RELAYER_PRIVATE_KEY is missing in environment.'
      );
    }

    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl, this.expectedChainId);
    }

    // Validate chainId on connected network
    try {
      const network = await this.provider.getNetwork();
      const connectedChainId = Number(network.chainId);
      if (connectedChainId !== this.expectedChainId) {
        throw new Error(
          `Connected network chainId (${connectedChainId}) does not match expected MST chainId (${this.expectedChainId})`
        );
      }
    } catch (err: any) {
      throw new Error(`Failed to verify MST network chain ID: ${err.message}`);
    }

    if (!this.relayerWallet) {
      this.relayerWallet = new ethers.Wallet(this.privateKey, this.provider);
    }

    if (!this.contract) {
      this.contract = new ethers.Contract(
        this.contractAddress,
        MachineMandiArtifact,
        this.relayerWallet
      );
    }

    return {
      provider: this.provider,
      relayerWallet: this.relayerWallet,
      contract: this.contract,
    };
  }

  /**
   * Retrieves the public address of the relayer wallet if configured.
   */
  getRelayerAddress(): string | undefined {
    if (this.relayerWallet) {
      return this.relayerWallet.address;
    }
    if (this.privateKey) {
      try {
        const tempWallet = new ethers.Wallet(this.privateKey);
        return tempWallet.address;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Queries the on-chain Job struct and maps all 13 fields into OnChainJob.
   */
  async getJob(jobId: number): Promise<OnChainJob> {
    const { contract } = await this.ensureInitialized();

    const raw = await contract.getJob(BigInt(jobId));

    const job: OnChainJob = {
      nodeId: BigInt(raw.nodeId ?? raw[0]),
      buyer: String(raw.buyer ?? raw[1]),
      amount: BigInt(raw.amount ?? raw[2]),
      createdAt: BigInt(raw.createdAt ?? raw[3]),
      deadline: BigInt(raw.deadline ?? raw[4]),
      nonce: BigInt(raw.nonce ?? raw[5]),
      status: Number(raw.status ?? raw[6]),
      preValue: BigInt(raw.preValue ?? raw[7]),
      postValue: BigInt(raw.postValue ?? raw[8]),
      signer: String(raw.signer ?? raw[9]),
      payout: String(raw.payout ?? raw[10]),
      serviceHash: String(raw.serviceHash ?? raw[11]),
      minDelta: BigInt(raw.minDelta ?? raw[12]),
    };

    return job;
  }

  /**
   * Submits a device-signed work proof to the live MST MachineMandi contract.
   *
   * Flow:
   * 1. Query on-chain job via getJob(jobId)
   * 2. Perform local pre-flight checks (status, delta, timestamps, signature length)
   * 3. Locally verify EIP-712 signature against job.signer
   * 4. Broadcast submitProof(...) on-chain via relayer wallet
   * 5. Wait for transaction confirmation and return real txHash
   */
  async submitProof(proof: DeviceProof): Promise<{ txHash: string }> {
    const { contract } = await this.ensureInitialized();

    // 1. Fetch on-chain job data
    const job = await this.getJob(proof.jobId);

    // 2 & 3. Local pre-flight validation and EIP-712 verification
    validateProofPreFlight(
      proof,
      job,
      this.expectedChainId,
      this.contractAddress
    );

    const preReadingVal = proof.preReading !== undefined ? proof.preReading : proof.preMoisture ?? 0;
    const postReadingVal = proof.postReading !== undefined ? proof.postReading : proof.postMoisture ?? 0;

    // 4. Execute on-chain transaction
    const tx = await contract.submitProof(
      BigInt(proof.jobId),
      BigInt(proof.nodeId),
      BigInt(proof.nonce),
      BigInt(proof.startedAt),
      BigInt(proof.completedAt),
      BigInt(Math.round(preReadingVal)),
      BigInt(Math.round(postReadingVal)),
      proof.serviceHash,
      proof.signature
    );

    // 5. Await transaction receipt
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction reverted on-chain with hash: ${tx.hash}`);
    }

    return { txHash: receipt.hash };
  }

  /**
   * Starts listening for JobCreated events on the live MachineMandi contract.
   */
  async startJobListener(
    callback: (event: JobCreatedEvent) => void | Promise<void>
  ): Promise<void> {
    this.listenerCallback = callback;
    const { contract } = await this.ensureInitialized();

    contract.on(
      'JobCreated',
      (jobId, nodeId, buyer, amount, deadline, nonce, event) => {
        const payload: JobCreatedEvent = {
          jobId: Number(jobId),
          nodeId: Number(nodeId),
          buyer: String(buyer),
          amount: amount.toString(),
          deadline: Number(deadline),
          nonce: Number(nonce),
          transactionHash: event.log?.transactionHash,
          blockNumber: event.log?.blockNumber,
        };

        if (this.listenerCallback) {
          Promise.resolve(this.listenerCallback(payload)).catch((err) => {
            console.error('[MstBlockchainService] Error in JobCreated callback:', err);
          });
        }
      }
    );
  }

  /**
   * Stops listening for JobCreated events.
   */
  async stopJobListener(): Promise<void> {
    if (this.contract) {
      this.contract.removeAllListeners('JobCreated');
    }
    this.listenerCallback = null;
  }
}

// Export singleton instance of live adapter
export const mstBlockchainService = new MstBlockchainService();
