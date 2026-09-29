import { DeviceProof, JobRecord, JobStatus, BlockchainService, JobCreatedEvent } from '../types';
import { config } from '../config';

/**
 * Valid Job State Machine Transitions
 *
 * Normal flow:
 * WAITING -> PROCESSING -> PROOF_RECEIVED -> SUBMITTING -> SUBMITTED
 *
 * Failures / Timeouts:
 * SUBMITTING -> FAILED (allows retry back to SUBMITTING)
 * WAITING -> EXPIRED
 * PROCESSING -> EXPIRED
 */
export const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  WAITING: ['PROCESSING', 'EXPIRED'],
  PROCESSING: ['PROOF_RECEIVED', 'FAILED', 'EXPIRED'],
  PROOF_RECEIVED: ['SUBMITTING', 'FAILED'],
  SUBMITTING: ['SUBMITTED', 'FAILED'],
  SUBMITTED: [], // Terminal success
  FAILED: ['SUBMITTING'], // Safe retry transition
  EXPIRED: [], // Terminal expired
};

/**
 * Checks if a transition between two job states is allowed.
 */
export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * In-Memory Job Queue with State Machine, Retry Logic, and Event Listener Ingestion
 */
export class JobQueue {
  private jobs: Map<string, JobRecord> = new Map();

  /**
   * Helper to generate unique key for jobId and nonce
   */
  makeKey(jobId: number, nonce: number): string {
    return `${jobId}:${nonce}`;
  }

  /**
   * Checks whether a proof with the given jobId and nonce has already been submitted.
   */
  hasDuplicate(jobId: number, nonce: number): boolean {
    const existing = this.jobs.get(this.makeKey(jobId, nonce));
    return Boolean(existing && (existing.proof !== undefined || existing.status !== 'WAITING'));
  }

  /**
   * Checks whether any job with the given jobId exists in the queue.
   */
  hasJob(jobId: number): boolean {
    return this.getLatestJobById(jobId) !== undefined;
  }

  /**
   * Retrieves a job record by jobId and nonce.
   */
  getJob(jobId: number, nonce: number): JobRecord | undefined {
    return this.jobs.get(this.makeKey(jobId, nonce));
  }

  /**
   * Retrieves the latest job record for a given jobId.
   */
  getLatestJobById(jobId: number): JobRecord | undefined {
    for (const record of Array.from(this.jobs.values()).reverse()) {
      if (record.jobId === jobId) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Creates a new job record in the WAITING state.
   */
  createJob(
    jobId: number,
    nodeId: number,
    nonce: number = 0,
    proof?: DeviceProof,
    extra?: {
      buyer?: string;
      amount?: string;
      deadline?: number;
    }
  ): JobRecord {
    const key = this.makeKey(jobId, nonce);
    const now = new Date().toISOString();

    const record: JobRecord = {
      jobId,
      nodeId,
      nonce,
      buyer: extra?.buyer,
      amount: extra?.amount,
      deadline: extra?.deadline,
      proof,
      status: 'WAITING',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(key, record);
    return record;
  }

  /**
   * Ingests a new job received from an on-chain JobCreated event.
   * - Enforces idempotency: ignores duplicate JobCreated events for existing jobId.
   * - Sets initial state strictly to WAITING.
   * - Does NOT automatically submit a proof.
   */
  addJobFromEvent(event: JobCreatedEvent): JobRecord | null {
    if (this.hasJob(event.jobId)) {
      return null;
    }

    return this.createJob(event.jobId, event.nodeId, event.nonce ?? 0, undefined, {
      buyer: event.buyer,
      amount: event.amount,
      deadline: event.deadline,
    });
  }

  /**
   * Transitions a job to a new state enforcing state machine rules.
   * Throws an error if the transition is illegal.
   */
  transitionTo(jobId: number, nonce: number, newStatus: JobStatus): JobRecord {
    const key = this.makeKey(jobId, nonce);
    const record = this.jobs.get(key);

    if (!record) {
      throw new Error(`Job not found for transition: ${jobId}:${nonce}`);
    }

    if (!isValidTransition(record.status, newStatus)) {
      throw new Error(
        `Invalid state transition: Cannot transition job ${jobId}:${nonce} from '${record.status}' to '${newStatus}'`
      );
    }

    record.status = newStatus;
    record.updatedAt = new Date().toISOString();
    return record;
  }

  /**
   * Submits the proof to the blockchain adapter with automatic retries and state machine progression.
   *
   * Flow:
   * 1. WAITING -> PROCESSING -> PROOF_RECEIVED -> SUBMITTING
   * 2. Attempt blockchain submission with up to maxRetries attempts.
   * 3. On success -> SUBMITTED.
   * 4. If retries are exhausted -> FAILED with lastError recorded.
   */
  async processJob(
    proof: DeviceProof,
    blockchainService: BlockchainService
  ): Promise<JobRecord> {
    const key = this.makeKey(proof.jobId, proof.nonce);
    let record = this.jobs.get(key);

    if (!record) {
      // Check if job was already created by on-chain event in WAITING state
      const existingWaitingJob = this.getLatestJobById(proof.jobId);
      if (existingWaitingJob && existingWaitingJob.status === 'WAITING') {
        this.jobs.delete(this.makeKey(existingWaitingJob.jobId, existingWaitingJob.nonce));
        record = existingWaitingJob;
        record.nonce = proof.nonce;
        record.nodeId = proof.nodeId;
        record.proof = proof;
        this.jobs.set(key, record);
        this.transitionTo(proof.jobId, proof.nonce, 'PROCESSING');
        this.transitionTo(proof.jobId, proof.nonce, 'PROOF_RECEIVED');
      } else {
        record = this.createJob(proof.jobId, proof.nodeId, proof.nonce, proof);
        this.transitionTo(proof.jobId, proof.nonce, 'PROCESSING');
        this.transitionTo(proof.jobId, proof.nonce, 'PROOF_RECEIVED');
      }
    } else {
      if (record.status === 'SUBMITTED') {
        throw new Error(
          `Job ${proof.jobId}:${proof.nonce} has already been successfully submitted`
        );
      }
      if (record.status === 'WAITING') {
        this.transitionTo(proof.jobId, proof.nonce, 'PROCESSING');
        this.transitionTo(proof.jobId, proof.nonce, 'PROOF_RECEIVED');
      } else if (record.status === 'PROCESSING') {
        this.transitionTo(proof.jobId, proof.nonce, 'PROOF_RECEIVED');
      }
      record.proof = proof;
    }

    // Move to SUBMITTING
    this.transitionTo(proof.jobId, proof.nonce, 'SUBMITTING');

    const maxRetries = config.retry.maxRetries;
    const retryDelay = config.retry.retryDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { txHash } = await blockchainService.submitProof(proof);
        record.txHash = txHash;
        this.transitionTo(proof.jobId, proof.nonce, 'SUBMITTED');
        return record;
      } catch (err: any) {
        const errorMsg = err?.message || 'Blockchain submission error';
        record.lastError = errorMsg;

        if (attempt < maxRetries) {
          record.retryCount++;
          if (retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        } else {
          // Exhausted retries -> transition to FAILED
          this.transitionTo(proof.jobId, proof.nonce, 'FAILED');
          throw err;
        }
      }
    }

    return record;
  }

  /**
   * Safely retries a previously FAILED job.
   * Will never retry an already SUBMITTED job.
   */
  async retryJob(
    jobId: number,
    nonce: number,
    blockchainService: BlockchainService
  ): Promise<JobRecord> {
    const key = this.makeKey(jobId, nonce);
    const record = this.jobs.get(key);

    if (!record) {
      throw new Error(`Job ${jobId}:${nonce} not found`);
    }

    if (record.status === 'SUBMITTED') {
      throw new Error(`Cannot retry job ${jobId}:${nonce}: already successfully submitted`);
    }

    if (!record.proof) {
      throw new Error(`Cannot retry job ${jobId}:${nonce}: no proof payload attached`);
    }

    // Re-attempt processing using the same proof and jobId/nonce
    return this.processJob(record.proof, blockchainService);
  }

  /**
   * Returns all stored jobs.
   */
  getAllJobs(): JobRecord[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Number of jobs currently tracked.
   */
  size(): number {
    return this.jobs.size;
  }

  /**
   * Clears all jobs (useful for test resets).
   */
  clear(): void {
    this.jobs.clear();
  }
}

// Export singleton instance for the application
export const jobQueue = new JobQueue();
