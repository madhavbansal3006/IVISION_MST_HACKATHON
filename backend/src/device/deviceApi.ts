import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { DeviceProof, ProofSubmissionResponse, ON_CHAIN_JOB_STATUS } from '../types';
import { jobQueue } from '../jobs/jobQueue';
import { blockchainService } from '../blockchain/contract';
import { mstBlockchainService } from '../blockchain/mstContract';
import { config } from '../config';

export const deviceRouter = Router();

/**
 * Validates the device proof request body against structural, timing, and logical constraints.
 * Returns an error message string if validation fails, or null if valid.
 */
export function validateDeviceProof(body: any): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a valid JSON object';
  }

  const {
    jobId,
    nodeId,
    nonce,
    startedAt,
    completedAt,
    preReading,
    postReading,
    preMoisture,
    postMoisture,
    serviceHash,
    signature,
  } = body;

  // 1. jobId: positive integer
  if (typeof jobId !== 'number' || !Number.isInteger(jobId) || jobId <= 0) {
    return 'Invalid or missing field: jobId must be a positive integer';
  }

  // 2. nodeId: positive integer
  if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId <= 0) {
    return 'Invalid or missing field: nodeId must be a positive integer';
  }

  // 3. nonce: non-negative integer
  if (typeof nonce !== 'number' || !Number.isInteger(nonce) || nonce < 0) {
    return 'Invalid or missing field: nonce must be a non-negative integer';
  }

  // 4. startedAt: positive Unix timestamp
  if (
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    startedAt <= 0
  ) {
    return 'Invalid or missing field: startedAt must be a valid positive Unix timestamp';
  }

  // 5. completedAt: positive Unix timestamp >= startedAt and not unreasonably far in future
  if (
    typeof completedAt !== 'number' ||
    !Number.isFinite(completedAt) ||
    completedAt <= 0
  ) {
    return 'Invalid or missing field: completedAt must be a valid positive Unix timestamp';
  }

  if (completedAt < startedAt) {
    return 'Timing validation error: completedAt cannot be earlier than startedAt';
  }

  // Check configurable future drift threshold
  if (config.validation.maxFutureDriftSeconds > 0) {
    const currentEpoch = Math.floor(Date.now() / 1000);
    const maxAllowedFuture = currentEpoch + config.validation.maxFutureDriftSeconds;
    if (completedAt > maxAllowedFuture) {
      return `Timing validation error: completedAt (${completedAt}) is unreasonably far in the future`;
    }
  }

  // 6. preReading / preMoisture validation
  const preVal = preReading !== undefined ? preReading : preMoisture;
  if (preVal === undefined) {
    return 'Invalid or missing field: preReading (or preMoisture) is required';
  }
  if (typeof preVal !== 'number' || !Number.isFinite(preVal) || preVal < 0) {
    return 'Invalid or missing field: preReading must be a non-negative finite number';
  }
  if (preMoisture !== undefined && (preMoisture < 0 || preMoisture > 100 || isNaN(preMoisture))) {
    return 'Invalid or missing field: preMoisture must be a finite number between 0 and 100';
  }

  // 7. postReading / postMoisture validation
  const postVal = postReading !== undefined ? postReading : postMoisture;
  if (postVal === undefined) {
    return 'Invalid or missing field: postReading (or postMoisture) is required';
  }
  if (typeof postVal !== 'number' || !Number.isFinite(postVal) || postVal < 0) {
    return 'Invalid or missing field: postReading must be a non-negative finite number';
  }
  if (postMoisture !== undefined && (postMoisture < 0 || postMoisture > 100 || isNaN(postMoisture))) {
    return 'Invalid or missing field: postMoisture must be a finite number between 0 and 100';
  }

  // 8. Configurable moisture increase check
  if (config.validation.requireMoistureIncrease && postVal < preVal) {
    return `Moisture validation error: postMoisture (${postVal}) cannot be less than preMoisture (${preVal}) when REQUIRE_MOISTURE_INCREASE is enabled`;
  }

  // 9. serviceHash: non-empty hexadecimal string (e.g. 0x...)
  if (
    typeof serviceHash !== 'string' ||
    serviceHash.trim().length === 0 ||
    !/^0x[0-9a-fA-F]+$/.test(serviceHash.trim())
  ) {
    return 'Invalid or missing field: serviceHash must be a non-empty hexadecimal string starting with 0x';
  }

  // 10. signature: non-empty hexadecimal string (e.g. 0x...)
  if (
    typeof signature !== 'string' ||
    signature.trim().length === 0 ||
    !/^0x[0-9a-fA-F]+$/.test(signature.trim())
  ) {
    return 'Invalid or missing field: signature must be a non-empty hexadecimal string starting with 0x';
  }

  return null;
}

/**
 * POST /api/device/proof
 *
 * Endpoint for physical IoT machines to submit signed work proofs.
 *
 * Workflow:
 * 1. Validate request structure, timing, sensor readings, and hex encodings.
 * 2. Enforce idempotency: detect duplicate (jobId, nonce) submissions to prevent replay attacks.
 * 3. Progress job state: WAITING -> PROCESSING -> PROOF_RECEIVED -> SUBMITTING -> SUBMITTED.
 * 4. Submit to blockchain adapter with automatic retry mechanism.
 * 5. Return job status, mock txHash, or 502 error if blockchain relay exhausts retries.
 *
 * Trust Rule:
 * The backend does NOT hold or generate the device's private key.
 * The device signs the proof locally, and the relayer forwards the signature without modification.
 */
deviceRouter.post('/proof', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validate request
    const validationError = validateDeviceProof(req.body);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    const preVal = req.body.preReading !== undefined ? req.body.preReading : req.body.preMoisture;
    const postVal = req.body.postReading !== undefined ? req.body.postReading : req.body.postMoisture;

    const proof: DeviceProof = {
      jobId: req.body.jobId,
      nodeId: req.body.nodeId,
      nonce: req.body.nonce,
      startedAt: req.body.startedAt,
      completedAt: req.body.completedAt,
      preReading: preVal,
      postReading: postVal,
      preMoisture: preVal,
      postMoisture: postVal,
      serviceHash: req.body.serviceHash,
      signature: req.body.signature,
    };

    // 2. Detect duplicate (jobId, nonce) submissions
    if (jobQueue.hasDuplicate(proof.jobId, proof.nonce)) {
      res.status(409).json({
        success: false,
        error: `Duplicate submission: Proof for jobId ${proof.jobId} with nonce ${proof.nonce} has already been submitted`,
      });
      return;
    }

    // 3. Store proof in job queue & 4. Process with retry through blockchain adapter
    let jobRecord;
    try {
      jobRecord = await jobQueue.processJob(proof, blockchainService);
    } catch (relayError: any) {
      // Internal blockchain submission failure after retries
      res.status(502).json({
        success: false,
        error: relayError?.message || 'Blockchain submission failed after retries',
        jobId: proof.jobId,
        nodeId: proof.nodeId,
        nonce: proof.nonce,
        status: 'FAILED',
      });
      return;
    }

    // 5. Return successful job status and transaction hash
    const responseData: ProofSubmissionResponse = {
      success: true,
      message: 'Work proof successfully validated and submitted to blockchain relayer',
      jobId: jobRecord.jobId,
      nodeId: jobRecord.nodeId,
      nonce: jobRecord.nonce,
      status: jobRecord.status,
      txHash: jobRecord.txHash || '',
      submittedAt: jobRecord.updatedAt,
    };

    res.status(200).json(responseData);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error while processing work proof',
    });
  }
});

/**
 * GET /api/device/job/:jobId/status
 * Comprehensive read-only endpoint returning reconciled backend and on-chain state for a job.
 */
deviceRouter.get('/job/:jobId/status', async (req: Request, res: Response): Promise<void> => {
  const jobId = parseInt(req.params.jobId, 10);
  if (isNaN(jobId) || jobId <= 0) {
    res.status(400).json({ success: false, error: 'Invalid jobId parameter' });
    return;
  }

  // 1. Get queued job from backend state machine if present
  const queuedJob = jobQueue.getLatestJobById(jobId);

  // 2. Query on-chain state using blockchain service
  let onChainJob: any = null;
  try {
    const raw = await blockchainService.getJob(jobId);
    if (raw && (raw.nodeId !== undefined ? Number(raw.nodeId) > 0 : true)) {
      onChainJob = raw;
    }
  } catch {
    // Gracefully ignore on-chain query failure
  }

  if (!onChainJob && config.relayer.rpcUrl && config.relayer.contractAddress) {
    try {
      const liveJob = await mstBlockchainService.getJob(jobId);
      if (liveJob && (liveJob.nodeId !== undefined ? Number(liveJob.nodeId) > 0 : true)) {
        onChainJob = liveJob;
      }
    } catch {
      // Ignore
    }
  }

  if (!queuedJob && !onChainJob) {
    res.status(404).json({ success: false, error: `Job with ID ${jobId} not found` });
    return;
  }

  // 3. Map on-chain status (0 = OPEN, 1 = COMPLETED, 2 = REFUNDED)
  let status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REFUNDED' | 'FAILED' = 'PENDING';
  if (onChainJob && onChainJob.status === ON_CHAIN_JOB_STATUS.COMPLETED) {
    status = 'COMPLETED';
  } else if (onChainJob && onChainJob.status === ON_CHAIN_JOB_STATUS.REFUNDED) {
    status = 'REFUNDED';
  } else if (queuedJob?.status === 'SUBMITTED') {
    status = 'COMPLETED';
  } else if (
    queuedJob?.status === 'SUBMITTING' ||
    queuedJob?.status === 'PROOF_RECEIVED' ||
    queuedJob?.status === 'PROCESSING'
  ) {
    status = 'PROCESSING';
  } else if (queuedJob?.status === 'FAILED') {
    status = 'FAILED';
  } else {
    status = 'PENDING';
  }

  // 4. Resolve sensor readings
  let preReading: number | null = null;
  let postReading: number | null = null;

  if (queuedJob?.proof?.preReading !== undefined) {
    preReading = queuedJob.proof.preReading;
  } else if (onChainJob && onChainJob.preValue !== undefined && Number(onChainJob.preValue) > 0) {
    preReading = Number(onChainJob.preValue);
  }

  if (queuedJob?.proof?.postReading !== undefined) {
    postReading = queuedJob.proof.postReading;
  } else if (onChainJob && onChainJob.postValue !== undefined && Number(onChainJob.postValue) > 0) {
    postReading = Number(onChainJob.postValue);
  }

  const delta = preReading !== null && postReading !== null ? postReading - preReading : null;

  // 5. Construct payload
  const result = {
    jobId,
    nodeId: queuedJob?.nodeId ?? (onChainJob ? Number(onChainJob.nodeId) : 1),
    status,
    buyer: onChainJob?.buyer || queuedJob?.buyer || '',
    amount: onChainJob?.amount ? ethers.formatEther(onChainJob.amount) : queuedJob?.amount || '0',
    deadline: Number(onChainJob?.deadline ?? queuedJob?.deadline ?? 0),
    nonce: Number(onChainJob?.nonce ?? queuedJob?.nonce ?? jobId),
    preReading,
    postReading,
    delta,
    signer: onChainJob?.signer || (queuedJob?.proof ? (onChainJob?.signer || '') : ''),
    payout: onChainJob?.payout || '',
    serviceHash: onChainJob?.serviceHash || queuedJob?.proof?.serviceHash || '',
    proofReceived: Boolean(queuedJob?.proof || (onChainJob && onChainJob.status === ON_CHAIN_JOB_STATUS.COMPLETED)),
    settlementTxHash: queuedJob?.txHash || onChainJob?.txHash || null,
    signature: queuedJob?.proof?.signature || null,
    startedAt: queuedJob?.proof?.startedAt || null,
    completedAt: queuedJob?.proof?.completedAt || null,
  };

  res.status(200).json({ success: true, ...result, job: result });
});

/**
 * GET /api/device/job/:jobId
 * Endpoint to inspect status and record of a submitted job.
 */
deviceRouter.get('/job/:jobId', async (req: Request, res: Response): Promise<void> => {
  const jobId = parseInt(req.params.jobId, 10);
  if (isNaN(jobId) || jobId <= 0) {
    res.status(400).json({ success: false, error: 'Invalid jobId parameter' });
    return;
  }

  let job: any = jobQueue.getLatestJobById(jobId);
  if (!job) {
    // Check on-chain if not in memory queue
    let onChain: any = null;
    try {
      const raw = await blockchainService.getJob(jobId);
      if (raw && (raw.nodeId !== undefined ? Number(raw.nodeId) > 0 : true)) {
        onChain = raw;
      }
    } catch {
      // Ignore
    }

    if (!onChain && config.relayer.rpcUrl && config.relayer.contractAddress) {
      try {
        const liveJob = await mstBlockchainService.getJob(jobId);
        if (liveJob && (liveJob.nodeId !== undefined ? Number(liveJob.nodeId) > 0 : true)) {
          onChain = liveJob;
        }
      } catch {
        // Ignore
      }
    }

    if (onChain) {
      job = {
        jobId,
        nodeId: Number(onChain.nodeId),
        nonce: Number(onChain.nonce),
        buyer: onChain.buyer,
        amount: ethers.formatEther(onChain.amount),
        deadline: Number(onChain.deadline),
        status: onChain.status === ON_CHAIN_JOB_STATUS.COMPLETED ? 'SUBMITTED' : 'WAITING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        txHash: onChain.txHash,
      };
    }
  }

  if (!job) {
    res.status(404).json({ success: false, error: `Job with ID ${jobId} not found` });
    return;
  }

  res.status(200).json({ success: true, job });
});
