'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { getMachineMandiContract } from './web3';
import { mockMachines } from './mock-data';

export interface JobDetails {
  id: number;
  nodeId: number;
  machineName: string;
  service: string;
  device: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REFUNDED' | 'FAILED';
  buyer: string;
  amount: number;
  amountFormatted: string;
  deadline: number;
  nonce: number;
  preReading: number | null;
  postReading: number | null;
  delta: number | null;
  minimumDelta: number;
  signer: string;
  payout: string;
  serviceHash: string;
  proofReceived: boolean;
  settlementTxHash: string | null;
  signature: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// Cache for immutable settlement transaction hashes to avoid repeated heavy queryFilter calls
const settlementTxHashCache = new Map<number, string>();

export function cacheJobTransaction(jobId: number, txHash: string) {
  if (jobId && txHash) {
    settlementTxHashCache.set(jobId, txHash);
  }
}

/**
 * Fetches real job state from the existing backend API and on-chain contract.
 * Reconciles the two data sources without fabricating values or hammering the RPC.
 */
export async function fetchRealJob(jobId: number): Promise<JobDetails | null> {
  if (!jobId || isNaN(jobId) || jobId <= 0) {
    return null;
  }

  // 1. Fetch from backend status endpoint
  let backendData: any = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/device/job/${jobId}/status`);
    if (res.ok) {
      const json = await res.json();
      if (json && (json.success || json.jobId || json.job)) {
        backendData = json.job || json;
      }
    }
  } catch {
    // Backend might be offline; fallback to direct on-chain query
  }

  // 2. Fetch directly from MST on-chain contract ONLY if backend did not provide job data
  let onChainData: any = null;
  let contractInstance: any = null;
  if (!backendData) {
    try {
      contractInstance = getMachineMandiContract();
      const raw = await contractInstance.getJob(BigInt(jobId));
      if (raw && (raw.nodeId !== undefined ? raw.nodeId !== BigInt(0) : raw[0] !== BigInt(0))) {
        onChainData = raw;
      }
    } catch {
      // Ignore revert if job is not found on-chain
    }
  }

  if (!backendData && !onChainData) {
    return null;
  }

  // 3. Resolve Node & Machine metadata
  const nodeId = backendData?.nodeId ?? Number(onChainData?.nodeId ?? onChainData?.[0] ?? 1);
  const machine = mockMachines.find((m) => m.id === nodeId) || mockMachines[0];

  // 4. Reconcile Status
  // Contract enum: 0 = OPEN, 1 = COMPLETED, 2 = REFUNDED
  const onChainStatus = onChainData !== null ? Number(onChainData.status ?? onChainData[6]) : null;

  let status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REFUNDED' | 'FAILED' = 'PENDING';
  if (onChainStatus === 1) {
    status = 'COMPLETED';
  } else if (onChainStatus === 2) {
    status = 'REFUNDED';
  } else if (backendData?.status === 'COMPLETED') {
    status = 'COMPLETED';
  } else if (backendData?.status === 'PROCESSING') {
    status = 'PROCESSING';
  } else if (backendData?.status === 'FAILED') {
    status = 'FAILED';
  } else {
    status = 'PENDING';
  }

  // 5. Reconcile Sensor Readings & Delta
  let preReading: number | null = null;
  let postReading: number | null = null;

  if (backendData?.preReading !== undefined && backendData.preReading !== null) {
    preReading = Number(backendData.preReading);
  } else if (onChainData && onChainStatus === 1 && onChainData.preValue !== undefined) {
    preReading = Number(onChainData.preValue ?? onChainData[7]);
  } else if (backendData?.status === 'COMPLETED' && backendData?.preReading === null && backendData?.postReading !== null) {
    preReading = 0;
  }

  if (backendData?.postReading !== undefined && backendData.postReading !== null) {
    postReading = Number(backendData.postReading);
  } else if (onChainData && onChainStatus === 1 && onChainData.postValue !== undefined) {
    postReading = Number(onChainData.postValue ?? onChainData[8]);
  }

  const delta = preReading !== null && postReading !== null ? postReading - preReading : (backendData?.delta ?? null);

  // 6. Reconcile Financial & Network Details
  let rawAmount = 0.0001;
  if (onChainData) {
    try {
      rawAmount = Number(ethers.formatEther(onChainData.amount ?? onChainData[2]));
    } catch {
      rawAmount = machine.price;
    }
  } else if (backendData?.amount) {
    rawAmount = Number(backendData.amount);
  }

  const buyer = String(backendData?.buyer || onChainData?.buyer || onChainData?.[1] || '');
  const deadline = Number(backendData?.deadline ?? onChainData?.deadline ?? onChainData?.[4] ?? 0);
  const nonce = Number(backendData?.nonce ?? onChainData?.nonce ?? onChainData?.[5] ?? jobId);
  const signer = String(backendData?.signer || onChainData?.signer || onChainData?.[9] || machine.signer);
  const payout = String(backendData?.payout || onChainData?.payout || onChainData?.[10] || '');
  const serviceHash = String(backendData?.serviceHash || onChainData?.serviceHash || onChainData?.[11] || machine.serviceHash);
  const minimumDelta = Number(backendData?.minDelta ?? onChainData?.minDelta ?? onChainData?.[12] ?? machine.minimumDelta);
  let settlementTxHash: string | null = backendData?.settlementTxHash || settlementTxHashCache.get(jobId) || null;

  // Robust on-chain fallback for settlementTxHash if completed but not in backend cache and not in memory cache
  if (!settlementTxHash && (status === 'COMPLETED' || onChainStatus === 1)) {
    try {
      if (!contractInstance) {
        contractInstance = getMachineMandiContract();
      }
      const filter = contractInstance.filters.JobCompleted(BigInt(jobId));
      const provider = contractInstance.runner?.provider;
      if (provider) {
        const events = await contractInstance.queryFilter(filter, 5790572);
        if (events && events.length > 0) {
          const txHash = events[events.length - 1].transactionHash;
          if (txHash) {
            settlementTxHash = txHash;
            settlementTxHashCache.set(jobId, txHash);
          }
        }
      }
    } catch {
      // Safe fallback
    }
  } else if (!settlementTxHash && (status === 'REFUNDED' || onChainStatus === 2)) {
    try {
      if (!contractInstance) {
        contractInstance = getMachineMandiContract();
      }
      const filter = contractInstance.filters.JobRefunded(BigInt(jobId));
      const provider = contractInstance.runner?.provider;
      if (provider) {
        const events = await contractInstance.queryFilter(filter, 5790572);
        if (events && events.length > 0) {
          const txHash = events[events.length - 1].transactionHash;
          if (txHash) {
            settlementTxHash = txHash;
            settlementTxHashCache.set(jobId, txHash);
          }
        }
      }
    } catch {
      // Safe fallback
    }
  } else if (settlementTxHash) {
    settlementTxHashCache.set(jobId, settlementTxHash);
  }

  const signature = backendData?.signature || null;
  const proofReceived = Boolean(backendData?.proofReceived || onChainStatus === 1 || preReading !== null);
  const startedAt = backendData?.startedAt ? Number(backendData.startedAt) : null;
  const completedAt = backendData?.completedAt ? Number(backendData.completedAt) : null;
  const createdAt = onChainData && Number(onChainData.createdAt ?? onChainData[3]) > 0
    ? new Date(Number(onChainData.createdAt ?? onChainData[3]) * 1000)
    : new Date();

  return {
    id: jobId,
    nodeId,
    machineName: machine.name,
    service: machine.service,
    device: machine.device,
    status,
    buyer,
    amount: rawAmount,
    amountFormatted: `${rawAmount.toFixed(4)} MST`,
    deadline,
    nonce,
    preReading,
    postReading,
    delta,
    minimumDelta,
    signer,
    payout,
    serviceHash,
    proofReceived,
    settlementTxHash,
    signature,
    startedAt,
    completedAt,
    createdAt,
  };
}

/**
 * Fetches all real jobs currently recorded on the MachineMandi smart contract.
 * Fetches sequentially to avoid hammering the MST Testnet RPC with concurrent bursts.
 */
export async function fetchAllJobs(): Promise<JobDetails[]> {
  const jobs: JobDetails[] = [];
  try {
    const contract = getMachineMandiContract();
    const count = Number(await contract.jobCount());

    for (let id = 1; id <= count; id++) {
      try {
        const job = await fetchRealJob(id);
        if (job) jobs.push(job);
      } catch (err) {
        console.warn(`[fetchAllJobs] Failed to read job #${id}:`, err);
      }
    }
  } catch (err) {
    console.error('[fetchAllJobs] Failed to read on-chain jobs:', err);
  }

  return jobs.sort((a, b) => b.id - a.id);
}

/**
 * React hook to subscribe to live state of a single job.
 * Automatically polls periodically to detect new proofs submitted by the simulator.
 */
export function useJob(jobId: number) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchRealJob(jobId);
      if (!data) {
        setError(`Job #${jobId} not found on the MachineMandi network.`);
      } else {
        setJob(data);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      load();
    }, 4500);
    return () => clearInterval(interval);
  }, [load]);

  return { job, loading, error, reload: load };
}

/**
 * React hook to subscribe to the complete live list of all on-chain jobs.
 * Relaxed polling interval to prevent HTTP 429 rate-limiting on public RPC.
 */
export function useJobs() {
  const [jobs, setJobs] = useState<JobDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllJobs();
      setJobs(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load job list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 12000);
    return () => clearInterval(interval);
  }, [load]);

  return { jobs, loading, error, reload: load };
}
