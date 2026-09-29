import { BlockchainService, JobCreatedEvent } from '../types';
import { blockchainService } from './contract';
import { jobQueue, JobQueue } from '../jobs/jobQueue';

/**
 * JobCreated Blockchain Event Listener
 *
 * Architecture:
 * MachineMandi Smart Contract
 *         ↓ (JobCreated event)
 * JobCreatedListener
 *         ↓
 * jobQueue.addJobFromEvent(...)
 *         ↓ (WAITING state)
 * Physical Device Job Processing
 *         ↓ (POST /api/device/proof)
 * Proof Validation & Relayer Submission
 *
 * Responsibilities:
 * 1. Listens for on-chain JobCreated events (from mock or live adapter).
 * 2. Idempotently creates and enqueues jobs in the WAITING state.
 * 3. Does NOT automatically submit proofs (device must perform physical work first).
 * 4. Ignores duplicate JobCreated events.
 */
export class JobCreatedListener {
  private running: boolean = false;
  private readonly blockchain: BlockchainService;
  private readonly queue: JobQueue;

  constructor(blockchain: BlockchainService, queue: JobQueue) {
    this.blockchain = blockchain;
    this.queue = queue;
  }

  /**
   * Starts listening for JobCreated events on the blockchain.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await this.blockchain.startJobListener(async (event: JobCreatedEvent) => {
      await this.handleJobCreated(event);
    });

    this.running = true;
    console.log(
      `[MachineMandi Listener] Started JobCreated listener (Mode: ${this.blockchain.mode})`
    );
  }

  /**
   * Stops listening for JobCreated events.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.blockchain.stopJobListener();
    this.running = false;
    console.log('[MachineMandi Listener] Stopped JobCreated listener');
  }

  /**
   * Returns current listener status.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Handles incoming JobCreated events.
   * Enqueues the job into jobQueue with initial state WAITING.
   * Silently ignores duplicate events if the job is already tracked.
   */
  async handleJobCreated(event: JobCreatedEvent): Promise<void> {
    if (!event || typeof event.jobId !== 'number' || event.jobId <= 0) {
      console.warn('[MachineMandi Listener] Ignored invalid JobCreated event:', event);
      return;
    }

    const createdJob = this.queue.addJobFromEvent(event);
    if (!createdJob) {
      console.log(
        `[MachineMandi Listener] Duplicate JobCreated event ignored for jobId: ${event.jobId}`
      );
      return;
    }

    console.log(
      `[MachineMandi Listener] Ingested JobCreated event for jobId: ${event.jobId} (Node: ${event.nodeId}, Status: WAITING)`
    );
  }
}

// Export default singleton instance
export const jobCreatedListener = new JobCreatedListener(
  blockchainService,
  jobQueue
);
