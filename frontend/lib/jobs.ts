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

// Global in-memory cache and promise deduplication
let cachedJobs: JobDetails[] | null = null;
let cachedJobsTimestamp = 0;
const CACHE_TTL_MS = 10000;
let inFlightJobsPromise: Promise<JobDetails[]> | null = null;
const singleJobInFlight = new Map<number, Promise<JobDetails | null>>();
const jobsListeners = new Set<(jobs: JobDetails[]) => void>();

function notifyJobsListeners() {
  if (cachedJobs) {
    const list = [...cachedJobs];
    jobsListeners.forEach((listener) => {
      try {
        listener(list);
      } catch (err) {
        console.warn('[notifyJobsListeners] Error in listener:', err);
      }
    });
  }
}

/**
 * Pure synchronous mapping of an on-chain Job struct tuple to the JobDetails interface.
 */
function parseOnChainJob(id: number, raw: any): JobDetails {
  const nodeId = Number(raw.nodeId ?? raw[0] ?? 1);
  const machine = mockMachines.find((m) => m.id === nodeId) || mockMachines[0];
  const onChainStatus = Number(raw.status ?? raw[6]);

  let status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REFUNDED' | 'FAILED' = 'PENDING';
  if (onChainStatus === 1) {
    status = 'COMPLETED';
  } else if (onChainStatus === 2) {
    status = 'REFUNDED';
  } else {
    status = 'PENDING';
  }

  let preReading: number | null = null;
  let postReading: number | null = null;

  if (onChainStatus === 1 && raw.preValue !== undefined && Number(raw.preValue) > 0) {
    preReading = Number(raw.preValue);
  }
  if (onChainStatus === 1 && raw.postValue !== undefined && Number(raw.postValue) > 0) {
    postReading = Number(raw.postValue);
  }

  const delta = preReading !== null && postReading !== null ? postReading - preReading : null;

  let rawAmount = 0.0001;
  try {
    rawAmount = Number(ethers.formatEther(raw.amount ?? raw[2]));
  } catch {
    rawAmount = machine.price;
  }

  const buyer = String(raw.buyer ?? raw[1] ?? '');
  const deadline = Number(raw.deadline ?? raw[4] ?? 0);
  const nonce = Number(raw.nonce ?? raw[5] ?? id);
  const signer = String(raw.signer ?? raw[9] ?? machine.signer);
  const payout = String(raw.payout ?? raw[10] ?? '');
  const serviceHash = String(raw.serviceHash ?? raw[11] ?? machine.serviceHash);
  const minimumDelta = Number(raw.minDelta ?? raw[12] ?? machine.minimumDelta);
  const settlementTxHash = settlementTxHashCache.get(id) || null;
  const proofReceived = onChainStatus === 1 || preReading !== null;
  const createdAt = Number(raw.createdAt ?? raw[3]) > 0
    ? new Date(Number(raw.createdAt ?? raw[3]) * 1000)
    : new Date();

  return {
    id,
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
    signature: null,
    startedAt: null,
    completedAt: null,
    createdAt,
  };
}

let isEnriching = false;
let lastEnrichBlock = 5790572;

/**
 * Non-blocking background event query to resolve transaction hashes for completed and refunded jobs.
 * Obtains current block once and queries batch event filters efficiently.
 */
async function enrichCompletedAndRefundedTxHashes(contract: ethers.Contract, jobs: JobDetails[]) {
  const needsEnrichment = jobs.some(
    (j) => (j.status === 'COMPLETED' || j.status === 'REFUNDED') && !settlementTxHashCache.has(j.id)
  );

  if (!needsEnrichment || isEnriching) return;
  isEnriching = true;

  try {
    const provider = contract.runner?.provider;
    if (!provider) return;

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = lastEnrichBlock;

    const [completedEvents, refundedEvents] = await Promise.all([
      contract.queryFilter(contract.filters.JobCompleted(), fromBlock, currentBlock).catch(() => []),
      contract.queryFilter(contract.filters.JobRefunded(), fromBlock, currentBlock).catch(() => []),
    ]);

    let updated = false;
    for (const ev of completedEvents) {
      if ('args' in ev && ev.args && ev.transactionHash) {
        const jobId = Number(ev.args[0]);
        if (jobId && !settlementTxHashCache.has(jobId)) {
          settlementTxHashCache.set(jobId, ev.transactionHash);
          updated = true;
        }
      }
    }

    for (const ev of refundedEvents) {
      if ('args' in ev && ev.args && ev.transactionHash) {
        const jobId = Number(ev.args[0]);
        if (jobId && !settlementTxHashCache.has(jobId)) {
          settlementTxHashCache.set(jobId, ev.transactionHash);
          updated = true;
        }
      }
    }

    lastEnrichBlock = currentBlock;

    if (updated && cachedJobs) {
      cachedJobs = cachedJobs.map((j) => {
        const tx = settlementTxHashCache.get(j.id);
        if (tx && !j.settlementTxHash) {
          return { ...j, settlementTxHash: tx };
        }
        return j;
      });
      notifyJobsListeners();
    }
  } catch (err) {
    console.warn('[enrichEvents] Non-critical background enrichment warning:', err);
  } finally {
    isEnriching = false;
  }
}

/**
 * Fetches real job state from the existing backend API and on-chain contract.
 * Reconciles data sources with request deduplication and caching.
 */
export async function fetchRealJob(jobId: number): Promise<JobDetails | null> {
  if (!jobId || isNaN(jobId) || jobId <= 0) {
    return null;
  }

  // Deduplicate concurrent requests for the exact same job ID
  if (singleJobInFlight.has(jobId)) {
    return singleJobInFlight.get(jobId)!;
  }

  const jobPromise = (async () => {
    // 1. Fetch from backend status endpoint (with short timeout so offline or slow backend doesn't hang)
    let backendData: any = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${BACKEND_URL}/api/device/job/${jobId}/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json && (json.success || json.jobId || json.job)) {
          backendData = json.job || json;
        }
      }
    } catch {
      // Backend might be offline; fallback to direct on-chain query
    }

    // 2. Fetch directly from MST on-chain contract (authoritative blockchain truth)
    let onChainData: any = null;
    let contractInstance: any = null;
    try {
      contractInstance = getMachineMandiContract();
      const raw = await contractInstance.getJob(BigInt(jobId));
      if (raw && (raw.nodeId !== undefined ? raw.nodeId !== BigInt(0) : raw[0] !== BigInt(0))) {
        onChainData = raw;
      }
    } catch {
      // Ignore revert if job is not found on-chain
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

    // Single-job event fallback if completed/refunded and not yet cached
    if (!settlementTxHash && (status === 'COMPLETED' || onChainStatus === 1)) {
      try {
        if (!contractInstance) contractInstance = getMachineMandiContract();
        const filter = contractInstance.filters.JobCompleted(BigInt(jobId));
        const events = await contractInstance.queryFilter(filter, 5790572);
        if (events && events.length > 0) {
          const txHash = events[events.length - 1].transactionHash;
          if (txHash) {
            settlementTxHash = txHash;
            settlementTxHashCache.set(jobId, txHash);
          }
        }
      } catch {}
    } else if (!settlementTxHash && (status === 'REFUNDED' || onChainStatus === 2)) {
      try {
        if (!contractInstance) contractInstance = getMachineMandiContract();
        const filter = contractInstance.filters.JobRefunded(BigInt(jobId));
        const events = await contractInstance.queryFilter(filter, 5790572);
        if (events && events.length > 0) {
          const txHash = events[events.length - 1].transactionHash;
          if (txHash) {
            settlementTxHash = txHash;
            settlementTxHashCache.set(jobId, txHash);
          }
        }
      } catch {}
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
  })();

  singleJobInFlight.set(jobId, jobPromise);
  try {
    return await jobPromise;
  } finally {
    singleJobInFlight.delete(jobId);
  }
}

/**
 * Fetches all real jobs currently recorded on the MachineMandi smart contract.
 * Uses high-performance parallel on-chain calls and shared memory cache.
 */
export async function fetchAllJobs(forceRefresh = false): Promise<JobDetails[]> {
  const now = Date.now();
  if (!forceRefresh && cachedJobs && (now - cachedJobsTimestamp < CACHE_TTL_MS)) {
    return cachedJobs;
  }

  if (inFlightJobsPromise) {
    return inFlightJobsPromise;
  }

  inFlightJobsPromise = (async () => {
    try {
      const contract = getMachineMandiContract();
      const count = Number(await contract.jobCount());
      if (count <= 0) {
        cachedJobs = [];
        cachedJobsTimestamp = Date.now();
        return [];
      }

      // Fetch on-chain jobs concurrently in parallel batches
      const jobPromises: Promise<JobDetails | null>[] = [];
      for (let id = 1; id <= count; id++) {
        jobPromises.push(
          contract
            .getJob(BigInt(id))
            .then((raw: any) => parseOnChainJob(id, raw))
            .catch((err: any) => {
              console.warn(`[fetchAllJobs] Failed to read on-chain job #${id}:`, err?.message || err);
              return null;
            })
        );
      }

      const results = await Promise.all(jobPromises);
      const validJobs = results.filter((j): j is JobDetails => j !== null).sort((a, b) => b.id - a.id);

      cachedJobs = validJobs;
      cachedJobsTimestamp = Date.now();

      // Trigger background enrichment for transaction hashes (non-blocking)
      enrichCompletedAndRefundedTxHashes(contract, validJobs).catch(() => {});

      return validJobs;
    } catch (err) {
      console.error('[fetchAllJobs] Failed to read on-chain jobs:', err);
      return cachedJobs || [];
    } finally {
      inFlightJobsPromise = null;
    }
  })();

  return inFlightJobsPromise;
}

/**
 * React hook to subscribe to live state of a single job.
 * Automatically polls periodically to detect new proofs submitted by the simulator.
 */
export function useJob(jobId: number, options?: { fastPolling?: boolean }) {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fastPolling = options?.fastPolling ?? false;

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
    // Stop active polling once final blockchain state is confirmed
    if (job && (job.status === 'COMPLETED' || job.status === 'REFUNDED')) {
      return;
    }
    const intervalTime = fastPolling ? 1500 : 4000;
    const interval = setInterval(() => {
      load();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [load, fastPolling, job?.status]);

  return { job, loading, error, reload: load };
}

/**
 * React hook to subscribe to the complete live list of all on-chain jobs.
 * Reuses global shared state and deduplicates network requests across components.
 */
export function useJobs() {
  const [jobs, setJobs] = useState<JobDetails[]>(() => cachedJobs || []);
  const [loading, setLoading] = useState<boolean>(() => !cachedJobs || cachedJobs.length === 0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      if (!cachedJobs || cachedJobs.length === 0 || force) {
        // Only trigger loading indicator if there's no data yet
        if (!cachedJobs || cachedJobs.length === 0) {
          setLoading(true);
        }
      }
      const data = await fetchAllJobs(force);
      setJobs(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load job list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedJobs && cachedJobs.length > 0) {
      setJobs(cachedJobs);
      setLoading(false);
    }

    const listener = (updatedJobs: JobDetails[]) => {
      setJobs(updatedJobs);
      setLoading(false);
    };
    jobsListeners.add(listener);

    load();

    const interval = setInterval(() => {
      load(true);
    }, 12000);

    return () => {
      jobsListeners.delete(listener);
      clearInterval(interval);
    };
  }, [load]);

  return { jobs, loading, error, reload: () => load(true) };
}

