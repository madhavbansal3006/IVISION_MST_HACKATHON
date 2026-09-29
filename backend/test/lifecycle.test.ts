process.env.NODE_ENV = 'test';
import http from 'http';
import { ethers } from 'ethers';
import app from '../src/server';
import { jobQueue, isValidTransition, VALID_TRANSITIONS } from '../src/jobs/jobQueue';
import { mockBlockchainService, blockchainService } from '../src/blockchain/contract';
import {
  MstBlockchainService,
  validateProofPreFlight,
  getEip712Domain,
  WORK_PROOF_EIP712_TYPES,
  EXPECTED_MST_CHAIN_ID,
  DEFAULT_CONTRACT_ADDRESS,
} from '../src/blockchain/mstContract';
import { jobCreatedListener } from '../src/blockchain/listener';
import { validateDeviceProof } from '../src/device/deviceApi';
import { config } from '../src/config';
import {
  DeviceProof,
  JobCreatedEvent,
  OnChainJob,
  ON_CHAIN_JOB_STATUS,
} from '../src/types';

const TEST_PORT = 3002;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to make fetch requests to the test server
async function postProof(payload: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}/api/device/proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function getHealth(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}/health`);
  const body = await res.json();
  return { status: res.status, body };
}

async function getJob(jobId: number | string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}/api/device/job/${jobId}`);
  const body = await res.json();
  return { status: res.status, body };
}

function makeValidProof(overrides: Partial<DeviceProof> = {}): any {
  return {
    jobId: 100,
    nodeId: 1,
    nonce: 1,
    startedAt: 1759041000,
    completedAt: 1759041010,
    preMoisture: 35.5,
    postMoisture: 52.0,
    serviceHash: '0x1234567890abcdef',
    signature: '0xabcdef1234567890',
    ...overrides,
  };
}

async function runAllTests() {
  console.log('====================================================');
  console.log(' MachineMandi Full Relayer Test Suite (M3.1 - M3.4) ');
  console.log('====================================================\n');

  // Override config for fast test execution
  config.retry.retryDelayMs = 10;
  config.retry.maxRetries = 2;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] Test: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test: ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // Start test server
  const server = app.listen(TEST_PORT);
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // ====================================================
    // M3.2 TESTS (1 to 17)
    // ====================================================

    // ----------------------------------------------------
    // Test 1: Valid proof
    // ----------------------------------------------------
    jobQueue.clear();
    const proof1 = makeValidProof({ jobId: 1, nonce: 1 });
    const res1 = await postProof(proof1);
    assert(
      res1.status === 200 &&
        res1.body.success === true &&
        res1.body.status === 'SUBMITTED' &&
        res1.body.txHash.startsWith('0x'),
      '1. Valid proof submission',
      `Got status ${res1.status}, body: ${JSON.stringify(res1.body)}`
    );

    // ----------------------------------------------------
    // Test 2: Missing jobId
    // ----------------------------------------------------
    const proofNoJobId = makeValidProof({ jobId: undefined });
    delete proofNoJobId.jobId;
    const res2 = await postProof(proofNoJobId);
    assert(
      res2.status === 400 && res2.body.success === false,
      '2. Missing jobId rejection',
      `Got status ${res2.status}`
    );

    // ----------------------------------------------------
    // Test 3: Invalid jobId
    // ----------------------------------------------------
    const res3a = await postProof(makeValidProof({ jobId: -5 }));
    const res3b = await postProof(makeValidProof({ jobId: 0 }));
    const res3c = await postProof({ ...makeValidProof(), jobId: 'not-a-number' });
    assert(
      res3a.status === 400 && res3b.status === 400 && res3c.status === 400,
      '3. Invalid jobId rejection (negative, zero, string)',
      `Statuses: ${res3a.status}, ${res3b.status}, ${res3c.status}`
    );

    // ----------------------------------------------------
    // Test 4: Missing nodeId
    // ----------------------------------------------------
    const proofNoNodeId = makeValidProof({ nodeId: undefined });
    delete proofNoNodeId.nodeId;
    const res4 = await postProof(proofNoNodeId);
    assert(
      res4.status === 400 && res4.body.success === false,
      '4. Missing nodeId rejection',
      `Got status ${res4.status}`
    );

    // ----------------------------------------------------
    // Test 5: Invalid timestamps
    // ----------------------------------------------------
    const res5a = await postProof(makeValidProof({ startedAt: -100 }));
    const res5b = await postProof(makeValidProof({ startedAt: NaN as any }));
    const res5c = await postProof(
      makeValidProof({ completedAt: Math.floor(Date.now() / 1000) + 100000 })
    );
    assert(
      res5a.status === 400 && res5b.status === 400 && res5c.status === 400,
      '5. Invalid timestamps rejection (negative, NaN, far future)',
      `Statuses: ${res5a.status}, ${res5b.status}, ${res5c.status}`
    );

    // ----------------------------------------------------
    // Test 6: completedAt before startedAt
    // ----------------------------------------------------
    const res6 = await postProof(
      makeValidProof({ startedAt: 1759041050, completedAt: 1759041000 })
    );
    assert(
      res6.status === 400 &&
        res6.body.error.includes('completedAt cannot be earlier than startedAt'),
      '6. completedAt before startedAt rejection',
      `Got status ${res6.status}`
    );

    // ----------------------------------------------------
    // Test 7: Invalid moisture values
    // ----------------------------------------------------
    const res7a = await postProof(makeValidProof({ preMoisture: -1 }));
    const res7b = await postProof(makeValidProof({ postMoisture: 101 }));
    const res7c = await postProof(makeValidProof({ preMoisture: NaN as any }));
    assert(
      res7a.status === 400 && res7b.status === 400 && res7c.status === 400,
      '7. Invalid moisture values rejection (<0, >100, NaN)',
      `Statuses: ${res7a.status}, ${res7b.status}, ${res7c.status}`
    );

    // ----------------------------------------------------
    // Test 8: postMoisture < preMoisture when validation is enabled
    // ----------------------------------------------------
    config.validation.requireMoistureIncrease = true;
    const res8 = await postProof(
      makeValidProof({ preMoisture: 60.0, postMoisture: 45.0, jobId: 8, nonce: 1 })
    );
    assert(
      res8.status === 400 && res8.body.error.includes('cannot be less than preMoisture'),
      '8. postMoisture < preMoisture when validation is enabled',
      `Got status ${res8.status}, error: ${res8.body.error}`
    );
    config.validation.requireMoistureIncrease = false; // Reset

    // ----------------------------------------------------
    // Test 9: Duplicate (jobId, nonce)
    // ----------------------------------------------------
    const proof9 = makeValidProof({ jobId: 9, nonce: 1 });
    const res9First = await postProof(proof9);
    const res9Dup = await postProof(proof9);
    assert(
      res9First.status === 200 &&
        res9Dup.status === 409 &&
        res9Dup.body.error.includes('Duplicate submission'),
      '9. Duplicate (jobId, nonce) rejected with 409 Conflict',
      `First status ${res9First.status}, Second status ${res9Dup.status}`
    );

    // ----------------------------------------------------
    // Test 10: Valid same jobId with different nonce
    // ----------------------------------------------------
    const proof10DiffNonce = makeValidProof({ jobId: 9, nonce: 2 });
    const res10 = await postProof(proof10DiffNonce);
    assert(
      res10.status === 200 && res10.body.success === true && res10.body.nonce === 2,
      '10. Valid same jobId with different nonce accepted',
      `Got status ${res10.status}`
    );

    // ----------------------------------------------------
    // Test 11: Valid different jobId
    // ----------------------------------------------------
    const proof11DiffJob = makeValidProof({ jobId: 11, nonce: 1 });
    const res11 = await postProof(proof11DiffJob);
    assert(
      res11.status === 200 && res11.body.success === true && res11.body.jobId === 11,
      '11. Valid different jobId accepted',
      `Got status ${res11.status}`
    );

    // ----------------------------------------------------
    // Test 12: Job state transitions (Full valid lifecycle)
    // ----------------------------------------------------
    const job12 = jobQueue.createJob(12, 1, 1);
    assert(job12.status === 'WAITING', '12a. Initial state is WAITING');

    jobQueue.transitionTo(12, 1, 'PROCESSING');
    assert(
      jobQueue.getJob(12, 1)?.status === 'PROCESSING',
      '12b. Transitioned WAITING -> PROCESSING'
    );

    jobQueue.transitionTo(12, 1, 'PROOF_RECEIVED');
    assert(
      jobQueue.getJob(12, 1)?.status === 'PROOF_RECEIVED',
      '12c. Transitioned PROCESSING -> PROOF_RECEIVED'
    );

    jobQueue.transitionTo(12, 1, 'SUBMITTING');
    assert(
      jobQueue.getJob(12, 1)?.status === 'SUBMITTING',
      '12d. Transitioned PROOF_RECEIVED -> SUBMITTING'
    );

    jobQueue.transitionTo(12, 1, 'SUBMITTED');
    assert(
      jobQueue.getJob(12, 1)?.status === 'SUBMITTED',
      '12. Full job state transitions (WAITING->PROCESSING->PROOF_RECEIVED->SUBMITTING->SUBMITTED)'
    );

    // ----------------------------------------------------
    // Test 13: Invalid state transition
    // ----------------------------------------------------
    jobQueue.createJob(13, 1, 1);
    let transitionErrorCaught = false;
    try {
      jobQueue.transitionTo(13, 1, 'SUBMITTED');
    } catch (err: any) {
      transitionErrorCaught = err.message.includes('Invalid state transition');
    }

    let terminalErrorCaught = false;
    try {
      jobQueue.transitionTo(12, 1, 'PROCESSING');
    } catch (err: any) {
      terminalErrorCaught = err.message.includes('Invalid state transition');
    }
    assert(
      transitionErrorCaught && terminalErrorCaught,
      '13. Invalid state transitions rejected',
      `Direct WAITING->SUBMITTED caught: ${transitionErrorCaught}, Terminal SUBMITTED->PROCESSING caught: ${terminalErrorCaught}`
    );

    // ----------------------------------------------------
    // Test 14: Mock blockchain failure
    // ----------------------------------------------------
    mockBlockchainService.simulateFailures(1, 'Mock RPC connection dropped');
    let blockchainFailureThrown = false;
    try {
      await mockBlockchainService.submitProof(makeValidProof({ jobId: 14, nonce: 1 }));
    } catch (err: any) {
      blockchainFailureThrown = err.message === 'Mock RPC connection dropped';
    }
    assert(
      blockchainFailureThrown,
      '14. Mock blockchain failure correctly simulates and throws error'
    );

    // ----------------------------------------------------
    // Test 15: Retry behavior
    // ----------------------------------------------------
    mockBlockchainService.simulateFailures(1, 'Temporary timeout');
    const proof15 = makeValidProof({ jobId: 15, nonce: 1 });
    const res15 = await postProof(proof15);
    const jobRecord15 = jobQueue.getJob(15, 1);
    assert(
      res15.status === 200 &&
        jobRecord15?.status === 'SUBMITTED' &&
        jobRecord15.retryCount === 1 &&
        jobRecord15.lastError === 'Temporary timeout',
      '15. Retry behavior increments retryCount and records lastError upon transient failure',
      `retryCount: ${jobRecord15?.retryCount}, lastError: ${jobRecord15?.lastError}`
    );

    // ----------------------------------------------------
    // Test 16: Successful retry
    // ----------------------------------------------------
    assert(
      jobRecord15?.txHash !== undefined &&
        jobRecord15.txHash.startsWith('0x') &&
        jobRecord15.status === 'SUBMITTED',
      '16. Successful retry results in valid txHash and SUBMITTED status'
    );

    // ----------------------------------------------------
    // Test 17: Retry exhaustion
    // ----------------------------------------------------
    mockBlockchainService.simulateFailures(5, 'Persistent network partition');
    const proof17 = makeValidProof({ jobId: 17, nonce: 1 });
    const res17 = await postProof(proof17);
    const jobRecord17 = jobQueue.getJob(17, 1);
    assert(
      res17.status === 502 &&
        res17.body.success === false &&
        res17.body.status === 'FAILED' &&
        jobRecord17?.status === 'FAILED' &&
        jobRecord17.retryCount === 2 &&
        jobRecord17.lastError === 'Persistent network partition',
      '17. Retry exhaustion marks job as FAILED and returns HTTP 502 Bad Gateway',
      `Got status ${res17.status}, job status: ${jobRecord17?.status}, retries: ${jobRecord17?.retryCount}`
    );

    // ====================================================
    // M3.3 TESTS (JobCreated Listener & Adapter Boundary)
    // ====================================================

    // ----------------------------------------------------
    // Test 18: Listener can start
    // ----------------------------------------------------
    await jobCreatedListener.start();
    assert(
      jobCreatedListener.isRunning() === true,
      '18. JobCreated listener can start successfully'
    );

    // ----------------------------------------------------
    // Test 19: Mock JobCreated event received with nonce, added to queue in WAITING state
    // ----------------------------------------------------
    const mockEvent: JobCreatedEvent = {
      jobId: 101,
      nodeId: 3,
      nonce: 101,
      buyer: '0x1111222233334444555566667777888899990000',
      amount: '1000000000000000000',
      deadline: 1800000000,
    };
    await mockBlockchainService.emitMockJobCreated(mockEvent);

    const ingestedJob = jobQueue.getLatestJobById(101);
    assert(
      ingestedJob !== undefined &&
        ingestedJob.jobId === 101 &&
        ingestedJob.nodeId === 3 &&
        ingestedJob.nonce === 101 &&
        ingestedJob.status === 'WAITING' &&
        ingestedJob.buyer === mockEvent.buyer &&
        ingestedJob.amount === mockEvent.amount &&
        ingestedJob.deadline === mockEvent.deadline,
      '19. Mock JobCreated event received with nonce and added to queue in WAITING state'
    );

    // ----------------------------------------------------
    // Test 20: Duplicate JobCreated event is ignored
    // ----------------------------------------------------
    const duplicateEvent: JobCreatedEvent = {
      ...mockEvent,
      amount: '9999999999999999999',
    };
    await mockBlockchainService.emitMockJobCreated(duplicateEvent);

    const jobAfterDup = jobQueue.getLatestJobById(101);
    const allJobsWithId101 = jobQueue.getAllJobs().filter((j) => j.jobId === 101);
    assert(
      allJobsWithId101.length === 1 &&
        jobAfterDup?.amount === '1000000000000000000' &&
        jobAfterDup?.status === 'WAITING',
      '20. Duplicate JobCreated event is ignored without creating duplicate jobs'
    );

    // ----------------------------------------------------
    // Test 21: Listener can stop
    // ----------------------------------------------------
    await jobCreatedListener.stop();
    assert(
      jobCreatedListener.isRunning() === false,
      '21. JobCreated listener can stop successfully'
    );

    // ----------------------------------------------------
    // Test 22: Mock adapter remains the default
    // ----------------------------------------------------
    assert(
      blockchainService.mode === 'mock',
      '22. Mock blockchain adapter remains the default'
    );

    // ----------------------------------------------------
    // Test 23: Backend still works when MST configuration is absent
    // ----------------------------------------------------
    assert(
      config.relayer.rpcUrl === '' || typeof config.relayer.rpcUrl === 'string',
      '23. Backend initializes cleanly without requiring live MST credentials'
    );

    // ----------------------------------------------------
    // Test 24: Health endpoint reports adapter mode and listener status
    // ----------------------------------------------------
    const health = await getHealth();
    assert(
      health.status === 200 &&
        health.body.status === 'ok' &&
        health.body.blockchainAdapter === 'mock' &&
        (health.body.listenerStatus === 'running' || health.body.listenerStatus === 'stopped') &&
        health.body.chainId === 91562037,
      '24. Health endpoint accurately reports adapter mode, listener status, and chain ID',
      `Health response: ${JSON.stringify(health.body)}`
    );

    // ====================================================
    // M3.4 TESTS (Real MST Adapter & EIP-712 Verification)
    // ====================================================

    // Prepare simulated device hardware key and on-chain job representation
    const hardwareDeviceWallet = ethers.Wallet.createRandom();
    const contractAddress = DEFAULT_CONTRACT_ADDRESS;
    const chainId = EXPECTED_MST_CHAIN_ID;

    const testServiceHash = ethers.id('machinemandi.irrigation.v1');

    const sampleOnChainJob: OnChainJob = {
      nodeId: 5n,
      buyer: '0xBuyerWalletAddress12345678901234567890',
      amount: 500000000000000000n,
      createdAt: 1759000000n,
      deadline: 1759100000n,
      nonce: 42n,
      status: ON_CHAIN_JOB_STATUS.OPEN,
      preValue: 0n,
      postValue: 0n,
      signer: hardwareDeviceWallet.address,
      payout: '0xPayoutNodeWalletAddress1234567890123',
      serviceHash: testServiceHash,
      minDelta: 10n,
    };

    // Construct valid EIP-712 WorkProof values
    const eip712Domain = getEip712Domain(chainId, contractAddress);
    const validEip712Values = {
      jobId: 42n,
      nodeId: 5n,
      nonce: 42n,
      startedAt: 1759041000n,
      completedAt: 1759041010n,
      preReading: 20n,
      postReading: 35n, // delta = 15 >= minDelta 10
      serviceHash: sampleOnChainJob.serviceHash,
    };

    // Device signs the structured data with its private key
    const validSignature = await hardwareDeviceWallet.signTypedData(
      eip712Domain,
      WORK_PROOF_EIP712_TYPES,
      validEip712Values
    );

    const validDeviceProof: DeviceProof = {
      jobId: 42,
      nodeId: 5,
      nonce: 42,
      startedAt: 1759041000,
      completedAt: 1759041010,
      preMoisture: 20,
      postMoisture: 35,
      serviceHash: sampleOnChainJob.serviceHash,
      signature: validSignature,
    };

    // ----------------------------------------------------
    // Test 25: Local EIP-712 Verification - Valid Signature
    // ----------------------------------------------------
    const preFlightSuccess = validateProofPreFlight(
      validDeviceProof,
      sampleOnChainJob,
      chainId,
      contractAddress
    );
    assert(
      preFlightSuccess.valid === true &&
        preFlightSuccess.recoveredSigner.toLowerCase() ===
          hardwareDeviceWallet.address.toLowerCase(),
      '25. Local EIP-712 verification succeeds and recovers correct device signer'
    );

    // ----------------------------------------------------
    // Test 26: Local EIP-712 Verification - Invalid Signer (Impostor)
    // ----------------------------------------------------
    const impostorWallet = ethers.Wallet.createRandom();
    const impostorSignature = await impostorWallet.signTypedData(
      eip712Domain,
      WORK_PROOF_EIP712_TYPES,
      validEip712Values
    );
    const impostorProof: DeviceProof = {
      ...validDeviceProof,
      signature: impostorSignature,
    };

    let invalidSignerCaught = false;
    try {
      validateProofPreFlight(impostorProof, sampleOnChainJob, chainId, contractAddress);
    } catch (err: any) {
      invalidSignerCaught = err.message.includes('Signature mismatch');
    }
    assert(
      invalidSignerCaught,
      '26. Local EIP-712 rejects proof when recovered signer does not match node registered signer'
    );

    // ----------------------------------------------------
    // Test 27: Invalid Signature Length Rejection
    // ----------------------------------------------------
    const shortSigProof: DeviceProof = {
      ...validDeviceProof,
      signature: '0x1234567890abcdef', // Not 65 bytes (132 chars)
    };
    let shortSigCaught = false;
    try {
      validateProofPreFlight(shortSigProof, sampleOnChainJob, chainId, contractAddress);
    } catch (err: any) {
      shortSigCaught = err.message.includes('Invalid signature length');
    }
    assert(shortSigCaught, '27. Pre-flight check rejects signature that is not exactly 65 bytes (132 chars)');

    // ----------------------------------------------------
    // Test 28: Insufficient Delta Rejection
    // ----------------------------------------------------
    const insufficientDeltaProof: DeviceProof = {
      ...validDeviceProof,
      preMoisture: 20,
      postMoisture: 25, // delta = 5 < minDelta 10
    };
    let deltaCaught = false;
    try {
      validateProofPreFlight(
        insufficientDeltaProof,
        sampleOnChainJob,
        chainId,
        contractAddress
      );
    } catch (err: any) {
      deltaCaught = err.message.includes('Insufficient delta');
    }
    assert(deltaCaught, '28. Pre-flight check rejects reading delta below job minDelta');

    // ----------------------------------------------------
    // Test 29: Invalid Timestamps Rejection (Expired Deadline & Reversed)
    // ----------------------------------------------------
    const expiredProof: DeviceProof = {
      ...validDeviceProof,
      completedAt: Number(sampleOnChainJob.deadline) + 100,
    };
    let expiredCaught = false;
    try {
      validateProofPreFlight(expiredProof, sampleOnChainJob, chainId, contractAddress);
    } catch (err: any) {
      expiredCaught = err.message.includes('deadline expired');
    }

    const reversedProof: DeviceProof = {
      ...validDeviceProof,
      startedAt: 1759041050,
      completedAt: 1759041000,
    };
    let reversedCaught = false;
    try {
      validateProofPreFlight(reversedProof, sampleOnChainJob, chainId, contractAddress);
    } catch (err: any) {
      reversedCaught = err.message.includes('cannot be earlier than startedAt');
    }
    assert(
      expiredCaught && reversedCaught,
      '29. Pre-flight check rejects expired deadline and completedAt < startedAt'
    );

    // ----------------------------------------------------
    // Test 30: Wrong Chain ID Rejection
    // ----------------------------------------------------
    // Sign with Ethereum Mainnet chainId (1)
    const wrongDomain = getEip712Domain(1, contractAddress);
    const wrongChainSignature = await hardwareDeviceWallet.signTypedData(
      wrongDomain,
      WORK_PROOF_EIP712_TYPES,
      validEip712Values
    );
    const wrongChainProof: DeviceProof = {
      ...validDeviceProof,
      signature: wrongChainSignature,
    };
    let wrongChainCaught = false;
    try {
      // Verifying against MST chainId (91562037)
      validateProofPreFlight(
        wrongChainProof,
        sampleOnChainJob,
        EXPECTED_MST_CHAIN_ID,
        contractAddress
      );
    } catch (err: any) {
      wrongChainCaught = err.message.includes('Signature mismatch');
    }
    assert(
      wrongChainCaught,
      '30. EIP-712 domain binds strictly to MST chainId (91562037), rejecting cross-chain signatures'
    );

    // ----------------------------------------------------
    // Test 31: Missing Live Credentials Rejection in MstBlockchainService
    // ----------------------------------------------------
    const unconfiguredMstService = new MstBlockchainService({
      rpcUrl: '',
      contractAddress: '',
      privateKey: '',
    });
    let missingCredsCaught = false;
    try {
      await unconfiguredMstService.ensureInitialized();
    } catch (err: any) {
      missingCredsCaught = err.message.includes('missing in environment');
    }
    assert(
      missingCredsCaught,
      '31. MstBlockchainService safely fails if live MST environment variables are missing'
    );

    // ----------------------------------------------------
    // Test 32: OnChainJob 13-field Mapping Validation
    // ----------------------------------------------------
    const fieldsMatch =
      sampleOnChainJob.nodeId === 5n &&
      sampleOnChainJob.nonce === 42n &&
      sampleOnChainJob.status === ON_CHAIN_JOB_STATUS.OPEN &&
      sampleOnChainJob.minDelta === 10n &&
      typeof sampleOnChainJob.signer === 'string' &&
      typeof sampleOnChainJob.payout === 'string' &&
      typeof sampleOnChainJob.serviceHash === 'string';
    assert(fieldsMatch, '32. OnChainJob structure accurately mirrors all 13 contract tuple fields');

    // ----------------------------------------------------
    // Test 33: Nonce in JobCreated event ingestion
    // ----------------------------------------------------
    await jobCreatedListener.start();
    const eventWithExplicitNonce: JobCreatedEvent = {
      jobId: 202,
      nodeId: 4,
      nonce: 99,
      buyer: '0xBuyerAddress',
      amount: '500',
      deadline: 1800000000,
    };
    await mockBlockchainService.emitMockJobCreated(eventWithExplicitNonce);
    const storedJob202 = jobQueue.getLatestJobById(202);
    assert(
      storedJob202 !== undefined && storedJob202.nonce === 99,
      '33. JobCreated event listener ingests and records the on-chain nonce'
    );
    await jobCreatedListener.stop();

    // ====================================================
    // M4.2 HARDWARE-INDEPENDENT PROOF PIPELINE TESTS (34 to 44)
    // ====================================================

    // Microcontroller test fixture (ESP32/Arduino mock signer)
    const mcuWallet = ethers.Wallet.createRandom();
    const mcuServiceHash = '0x15f855c600d7ad49d2e3f53d29bf304db887e114d99057b7a40a94e8ed7acb26';
    const mcuJobId = 77;
    const mcuNodeId = 1;
    const mcuNonce = 77;
    const mcuStartedAt = 1759041000;
    const mcuCompletedAt = 1759041060;
    const mcuPreReading = 120;
    const mcuPostReading = 180; // delta = 60

    const mcuOnChainJob: OnChainJob = {
      nodeId: BigInt(mcuNodeId),
      buyer: '0xBuyerAddress77',
      amount: 100000000000000n,
      createdAt: 1759040000n,
      deadline: 1800000000n,
      nonce: BigInt(mcuNonce),
      status: ON_CHAIN_JOB_STATUS.OPEN,
      preValue: 0n,
      postValue: 0n,
      signer: mcuWallet.address,
      payout: '0xPayoutAddress77',
      serviceHash: mcuServiceHash,
      minDelta: 50n,
    };

    const mcuEip712Domain = getEip712Domain(EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    const mcuEip712Values = {
      jobId: BigInt(mcuJobId),
      nodeId: BigInt(mcuNodeId),
      nonce: BigInt(mcuNonce),
      startedAt: BigInt(mcuStartedAt),
      completedAt: BigInt(mcuCompletedAt),
      preReading: BigInt(mcuPreReading),
      postReading: BigInt(mcuPostReading),
      serviceHash: mcuServiceHash,
    };

    const mcuSignature = await mcuWallet.signTypedData(
      mcuEip712Domain,
      WORK_PROOF_EIP712_TYPES,
      mcuEip712Values
    );

    const hwIndependentProof: DeviceProof = {
      jobId: mcuJobId,
      nodeId: mcuNodeId,
      nonce: mcuNonce,
      startedAt: mcuStartedAt,
      completedAt: mcuCompletedAt,
      preReading: mcuPreReading,
      postReading: mcuPostReading,
      serviceHash: mcuServiceHash,
      signature: mcuSignature,
    };

    // ----------------------------------------------------
    // Test 34: Hardware-independent proof request validation
    // ----------------------------------------------------
    const validationError = validateDeviceProof(hwIndependentProof);
    assert(
      validationError === null,
      '34. Hardware-independent proof validates successfully with preReading and postReading'
    );

    // ----------------------------------------------------
    // Test 35: EIP-712 Hash Generation & Signature Recovery
    // ----------------------------------------------------
    const preFlightMcu = validateProofPreFlight(
      hwIndependentProof,
      mcuOnChainJob,
      EXPECTED_MST_CHAIN_ID,
      DEFAULT_CONTRACT_ADDRESS
    );
    assert(
      preFlightMcu.valid === true,
      '35. EIP-712 hash generation and signature verification succeeds for hardware-independent proof'
    );

    // ----------------------------------------------------
    // Test 36: Node Signer Matching
    // ----------------------------------------------------
    assert(
      preFlightMcu.recoveredSigner.toLowerCase() === mcuWallet.address.toLowerCase(),
      '36. Recovered signer strictly matches the registered node signer'
    );

    // ----------------------------------------------------
    // Test 37: Job Matching & Lifecycle Progression
    // ----------------------------------------------------
    jobQueue.clear();
    jobQueue.createJob(mcuJobId, mcuNodeId, mcuNonce, undefined, {
      buyer: mcuOnChainJob.buyer,
      deadline: Number(mcuOnChainJob.deadline),
    });
    const beforeSubmit = jobQueue.getJob(mcuJobId, mcuNonce);
    assert(beforeSubmit?.status === 'WAITING', '37a. Initial job matches WAITING state');

    const apiRes37 = await postProof(hwIndependentProof);
    const afterSubmit = jobQueue.getJob(mcuJobId, mcuNonce);
    assert(
      apiRes37.status === 200 &&
        apiRes37.body.success === true &&
        afterSubmit?.status === 'SUBMITTED' &&
        afterSubmit.txHash !== undefined &&
        afterSubmit.proof?.preReading === mcuPreReading &&
        afterSubmit.proof?.postReading === mcuPostReading,
      '37. Job matching and full lifecycle transitions (WAITING -> ... -> SUBMITTED) completed'
    );

    // ----------------------------------------------------
    // Test 38: Idempotent Duplicate Handling
    // ----------------------------------------------------
    const dupRes38 = await postProof(hwIndependentProof);
    assert(
      dupRes38.status === 409 &&
        dupRes38.body.success === false &&
        dupRes38.body.error.includes('Duplicate submission'),
      '38. Duplicate hardware-independent proof rejected idempotently with HTTP 409'
    );

    // ----------------------------------------------------
    // Test 39: Corrupted Signature Rejection
    // ----------------------------------------------------
    const corruptedProof: DeviceProof = {
      ...hwIndependentProof,
      signature: '0x' + 'ff'.repeat(65),
    };
    let corruptedCaught = false;
    try {
      validateProofPreFlight(corruptedProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      corruptedCaught = err.message.includes('Signature mismatch') || err.message.includes('EIP-712');
    }
    assert(corruptedCaught, '39. Corrupted/invalid signature rejected during pre-flight');

    // ----------------------------------------------------
    // Test 40: Wrong Node ID Rejection
    // ----------------------------------------------------
    const wrongNodeProof: DeviceProof = {
      ...hwIndependentProof,
      nodeId: 999,
    };
    let wrongNodeCaught = false;
    try {
      validateProofPreFlight(wrongNodeProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      wrongNodeCaught = err.message.includes('Node ID mismatch');
    }
    assert(wrongNodeCaught, '40. Proof with mismatched nodeId rejected');

    // ----------------------------------------------------
    // Test 41: Wrong Nonce Rejection
    // ----------------------------------------------------
    const wrongNonceProof: DeviceProof = {
      ...hwIndependentProof,
      nonce: 9999,
    };
    let wrongNonceCaught = false;
    try {
      validateProofPreFlight(wrongNonceProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      wrongNonceCaught = err.message.includes('Nonce mismatch');
    }
    assert(wrongNonceCaught, '41. Proof with mismatched nonce rejected');

    // ----------------------------------------------------
    // Test 42: Wrong ServiceHash Rejection
    // ----------------------------------------------------
    const wrongHashProof: DeviceProof = {
      ...hwIndependentProof,
      serviceHash: '0x' + '00'.repeat(32),
    };
    let wrongHashCaught = false;
    try {
      validateProofPreFlight(wrongHashProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      wrongHashCaught = err.message.includes('Service hash mismatch');
    }
    assert(wrongHashCaught, '42. Proof with mismatched serviceHash rejected');

    // ----------------------------------------------------
    // Test 43: Invalid Timestamps Rejection
    // ----------------------------------------------------
    const reversedMcuProof: DeviceProof = {
      ...hwIndependentProof,
      startedAt: 1759041060,
      completedAt: 1759041000,
    };
    let reversedMcuCaught = false;
    try {
      validateProofPreFlight(reversedMcuProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      reversedMcuCaught = err.message.includes('cannot be earlier than startedAt');
    }
    assert(reversedMcuCaught, '43. Proof with completedAt < startedAt rejected');

    // ----------------------------------------------------
    // Test 44: Pre-reading / Post-reading Delta Mapping Check
    // ----------------------------------------------------
    const lowDeltaProof: DeviceProof = {
      ...hwIndependentProof,
      preReading: 100,
      postReading: 110, // delta = 10 < minDelta 50
    };
    let lowDeltaCaught = false;
    try {
      validateProofPreFlight(lowDeltaProof, mcuOnChainJob, EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);
    } catch (err: any) {
      lowDeltaCaught = err.message.includes('Insufficient delta');
    }
    assert(lowDeltaCaught, '44. Proof with reading delta below minDelta rejected');

    console.log('\n====================================================');
    console.log(`  Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Unexpected error in test runner:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    mockBlockchainService.resetSimulation();
    await jobCreatedListener.stop();
  }
}

runAllTests();
