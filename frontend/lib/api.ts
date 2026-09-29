import { BACKEND_BASE_URL } from './config';

/**
 * Backend Response Types (matching Node/Express backend types)
 */

export interface BackendHealthResponse {
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

export type BackendJobStatus =
  | 'WAITING'
  | 'PROCESSING'
  | 'PROOF_RECEIVED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'FAILED'
  | 'EXPIRED';

export interface BackendDeviceProof {
  jobId: number;
  nodeId: number;
  nonce: number;
  startedAt: number;
  completedAt: number;
  preReading?: number;
  postReading?: number;
  preMoisture?: number;
  postMoisture?: number;
  serviceHash: string;
  signature: string;
}

export interface BackendJobRecord {
  jobId: number;
  nodeId: number;
  nonce: number;
  buyer?: string;
  amount?: string;
  deadline?: number;
  proof?: BackendDeviceProof;
  status: BackendJobStatus;
  txHash?: string;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendJobResponse {
  success: boolean;
  job?: BackendJobRecord;
  error?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Fetches the backend relayer health and network status.
 * Endpoint: GET /health
 */
export async function fetchBackendHealth(): Promise<BackendHealthResponse> {
  const url = `${BACKEND_BASE_URL}/health`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new ApiError(
        `Backend health check failed with HTTP ${response.status}`,
        response.status,
        errorText
      );
    }

    const data: BackendHealthResponse = await response.json();
    return data;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      `Unable to reach MachineMandi backend at ${BACKEND_BASE_URL}: ${error?.message || error}`,
      0
    );
  }
}

/**
 * Fetches job details and proof submission status from the backend relayer queue.
 * Endpoint: GET /api/device/job/:jobId
 */
export async function fetchBackendJob(jobId: number): Promise<BackendJobRecord> {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new ApiError(`Invalid jobId: must be a positive integer, got ${jobId}`, 400);
  }

  const url = `${BACKEND_BASE_URL}/api/device/job/${jobId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = `Job #${jobId} query failed with HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error) errorMessage = errorJson.error;
      } catch {
        // Fall back to status text
      }
      throw new ApiError(errorMessage, response.status);
    }

    const data: BackendJobResponse = await response.json();

    if (!data.success || !data.job) {
      throw new ApiError(data.error || `Job #${jobId} was not found in backend queue`, 404);
    }

    return data.job;
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      `Failed to fetch job #${jobId} from backend at ${url}: ${error?.message || error}`,
      0
    );
  }
}
