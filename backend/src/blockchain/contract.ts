import { ethers } from 'ethers';
import { DeviceProof, BlockchainService, JobCreatedEvent } from '../types';
import { config } from '../config';
import { mstBlockchainService, MstBlockchainService } from './mstContract';

/**
 * Mock implementation of BlockchainService.
 *
 * Used for deterministic automated testing and development when
 * running in MOCK mode.
 *
 * Features:
 * - Generates deterministic-looking EVM transaction hashes (0x + 64 hex characters) using ethers.keccak256
 * - Simulates on-chain job storage
 * - Simulates the JobCreated event listener and provides emitMockJobCreated for testing
 * - Supports simulated network failure injection for testing retry loops
 */
export class MockBlockchainService implements BlockchainService {
  readonly mode = 'mock' as const;

  private mockJobs: Map<number, any> = new Map();
  private failNextCount: number = 0;
  private failureErrorMessage: string = 'Simulated blockchain RPC failure';
  private listenerCallback: ((event: JobCreatedEvent) => void | Promise<void>) | null = null;

  /**
   * Configures simulated failures for testing retry and error handling.
   */
  simulateFailures(count: number, errorMessage?: string): void {
    this.failNextCount = count;
    if (errorMessage) {
      this.failureErrorMessage = errorMessage;
    }
  }

  /**
   * Resets any configured failure simulation.
   */
  resetSimulation(): void {
    this.failNextCount = 0;
    this.failureErrorMessage = 'Simulated blockchain RPC failure';
  }

  /**
   * Submits a device-signed work proof to the mock blockchain.
   */
  async submitProof(proof: DeviceProof): Promise<{ txHash: string }> {
    // Check if a failure simulation is active
    if (this.failNextCount > 0) {
      this.failNextCount--;
      throw new Error(this.failureErrorMessage);
    }

    // Generate a deterministic 32-byte keccak256 hash formatted as an EVM transaction hash
    const proofPayloadString = `machinemandi:proof:${proof.jobId}:${proof.nodeId}:${proof.nonce}:${proof.serviceHash}:${proof.signature}`;
    const txHash = ethers.keccak256(ethers.toUtf8Bytes(proofPayloadString));

    // Simulate minimal blockchain latency (e.g. 20ms)
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Store in mock on-chain state
    this.mockJobs.set(proof.jobId, {
      jobId: proof.jobId,
      nodeId: proof.nodeId,
      nonce: proof.nonce,
      startedAt: proof.startedAt,
      completedAt: proof.completedAt,
      preMoisture: proof.preMoisture,
      postMoisture: proof.postMoisture,
      serviceHash: proof.serviceHash,
      signature: proof.signature,
      txHash,
      status: 'CONFIRMED',
      timestamp: Math.floor(Date.now() / 1000),
    });

    return { txHash };
  }

  /**
   * Retrieves a job record by jobId from the mock blockchain ledger.
   */
  async getJob(jobId: number): Promise<any> {
    if (this.mockJobs.has(jobId)) {
      return this.mockJobs.get(jobId);
    }
    return null;
  }

  /**
   * Starts listening for mock JobCreated events.
   */
  startJobListener(
    callback: (event: JobCreatedEvent) => void | Promise<void>
  ): void {
    this.listenerCallback = callback;
  }

  /**
   * Stops listening for mock JobCreated events.
   */
  stopJobListener(): void {
    this.listenerCallback = null;
  }

  /**
   * Helper to check if listener is active.
   */
  isListenerActive(): boolean {
    return this.listenerCallback !== null;
  }

  /**
   * Emits a simulated JobCreated event to test event-driven queue ingestion.
   */
  async emitMockJobCreated(event: JobCreatedEvent): Promise<void> {
    if (this.listenerCallback) {
      await this.listenerCallback(event);
    }
  }
}

// Export default singleton mock instance
export const mockBlockchainService = new MockBlockchainService();

/**
 * Adapter Factory: returns MstBlockchainService when BLOCKCHAIN_ADAPTER_MODE is 'live',
 * otherwise returns MockBlockchainService.
 */
export function createBlockchainService(): BlockchainService {
  if (config.blockchainAdapterMode === 'live') {
    return mstBlockchainService;
  }
  return mockBlockchainService;
}

// Default export instance used across the app
export const blockchainService: BlockchainService = createBlockchainService();
