/**
 * MachineMandi Device-Signed Work Proof
 *
 * Trust Rule:
 * The physical IoT device generates its own private key and signs this payload.
 * The backend relayer NEVER holds or generates the device private key;
 * it only validates the payload structure, guards against duplicates,
 * and submits the signed proof on-chain via the relayer's gas-paying wallet.
 */
export interface DeviceProof {
  jobId: number;
  nodeId: number;
  nonce: number;
  startedAt: number;
  completedAt: number;
  preReading?: number;
  postReading?: number;
  // Legacy / backward-compatibility aliases:
  preMoisture?: number;
  postMoisture?: number;
  serviceHash: string;
  signature: string;
}

/**
 * Event emitted by the MachineMandi smart contract when a new job is created on-chain.
 */
export interface JobCreatedEvent {
  jobId: number;
  nodeId: number;
  nonce: number;
  buyer?: string;
  amount?: string;
  deadline?: number;
  transactionHash?: string;
  blockNumber?: number;
}

/**
 * On-chain Job structure retrieved from the MachineMandi contract via getJob(jobId).
 */
export interface OnChainJob {
  nodeId: bigint;
  buyer: string;
  amount: bigint;
  createdAt: bigint;
  deadline: bigint;
  nonce: bigint;
  status: number; // 0 = OPEN, 1 = COMPLETED, 2 = REFUNDED
  preValue: bigint;
  postValue: bigint;
  signer: string;
  payout: string;
  serviceHash: string;
  minDelta: bigint;
}

export const ON_CHAIN_JOB_STATUS = {
  OPEN: 0,
  COMPLETED: 1,
  REFUNDED: 2,
} as const;

/**
 * Job lifecycle states in the relayer state machine:
 * WAITING -> PROCESSING -> PROOF_RECEIVED -> SUBMITTING -> SUBMITTED
 * Failures transition to FAILED. Timeouts/Deadlines transition to EXPIRED.
 */
export type JobStatus =
  | 'WAITING'
  | 'PROCESSING'
  | 'PROOF_RECEIVED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'FAILED'
  | 'EXPIRED';

export interface JobRecord {
  jobId: number;
  nodeId: number;
  nonce: number;
  buyer?: string;
  amount?: string;
  deadline?: number;
  proof?: DeviceProof;
  status: JobStatus;
  txHash?: string;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Clean BlockchainService interface for the MachineMandi Relayer.
 * Supports both Mock and live MST implementations.
 */
export interface BlockchainService {
  readonly mode: 'mock' | 'live';
  submitProof(proof: DeviceProof): Promise<{ txHash: string }>;
  getJob(jobId: number): Promise<OnChainJob | any>;
  startJobListener(
    callback: (event: JobCreatedEvent) => void | Promise<void>
  ): Promise<void> | void;
  stopJobListener(): Promise<void> | void;
}

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  blockchainAdapter: 'mock' | 'live';
  listenerStatus: 'running' | 'stopped';
  relayerConfigured: boolean;
  chainId?: number;
  contractAddress?: string;
  relayerAddress?: string;
  rpcConnected?: boolean;
}

export interface ProofSubmissionResponse {
  success: boolean;
  message: string;
  jobId: number;
  nodeId: number;
  nonce: number;
  status: JobStatus;
  txHash: string;
  submittedAt: string;
}
