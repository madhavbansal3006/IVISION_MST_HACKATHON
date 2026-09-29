process.env.NODE_ENV = 'test';
import { ethers } from 'ethers';
import app from '../src/server';
import {
  createDemoWorkProof,
  runDemoSimulator,
  NODE1_ID,
  NODE1_REGISTERED_SIGNER,
  NODE1_DEFAULT_SERVICE_HASH,
  NODE1_MIN_DELTA,
} from '../src/device/demoSimulator';
import {
  getEip712Domain,
  WORK_PROOF_EIP712_TYPES,
  EXPECTED_MST_CHAIN_ID,
  DEFAULT_CONTRACT_ADDRESS,
} from '../src/blockchain/mstContract';
import { jobQueue } from '../src/jobs/jobQueue';

const TEST_PORT = 3003;
const TEST_BACKEND_URL = `http://localhost:${TEST_PORT}`;

async function runSimulatorTests() {
  console.log('====================================================');
  console.log(' MachineMandi Demo Device Simulator Test Suite      ');
  console.log('====================================================\n');

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

  // Create ephemeral test wallet (never used on real funds)
  const testWallet = ethers.Wallet.createRandom();
  const testPrivateKey = testWallet.privateKey;

  // Start test server for backend reachability tests
  const server = app.listen(TEST_PORT);
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // ----------------------------------------------------
    // Test 1: Valid proof construction
    // ----------------------------------------------------
    const proof = await createDemoWorkProof({
      jobId: 1,
      nodeId: 1,
      nonce: 0,
      startedAt: 1759041000,
      completedAt: 1759041030,
      preReading: 100,
      postReading: 160,
      serviceHash: NODE1_DEFAULT_SERVICE_HASH,
      privateKey: testPrivateKey,
      chainId: EXPECTED_MST_CHAIN_ID,
      verifyingContract: DEFAULT_CONTRACT_ADDRESS,
    });

    assert(proof.jobId === 1, '1a. Valid proof has correct jobId (1)');
    assert(proof.nodeId === 1, '1b. Valid proof has correct nodeId (1)');
    assert(proof.nonce === 0, '1c. Valid proof has correct nonce (0)');
    assert(proof.preReading === 100, '1d. Valid proof has correct preReading (100)');
    assert(proof.postReading === 160, '1e. Valid proof has correct postReading (160)');
    assert(
      typeof proof.signature === 'string' &&
        proof.signature.startsWith('0x') &&
        proof.signature.length === 132,
      '1f. Signature is a valid 65-byte hex string (132 chars starting with 0x)'
    );
    assert(
      proof.recoveredSigner.toLowerCase() === testWallet.address.toLowerCase(),
      '1g. Recovered signer strictly matches the test signing wallet'
    );

    // ----------------------------------------------------
    // Test 2: Correct EIP-712 domain
    // ----------------------------------------------------
    const domain = getEip712Domain(EXPECTED_MST_CHAIN_ID, DEFAULT_CONTRACT_ADDRESS);

    assert(domain.name === 'MachineMandi', '2a. EIP-712 domain name is exactly "MachineMandi"');
    assert(domain.version === '1', '2b. EIP-712 domain version is exactly "1"');
    assert(
      BigInt(domain.chainId) === BigInt(91562037),
      '2c. EIP-712 domain chainId is exactly 91562037'
    );
    assert(
      domain.verifyingContract.toLowerCase() === '0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE'.toLowerCase(),
      '2d. EIP-712 domain verifyingContract is exactly 0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE'
    );

    // ----------------------------------------------------
    // Test 3: Correct WorkProof type definition
    // ----------------------------------------------------
    const workProofFields = WORK_PROOF_EIP712_TYPES.WorkProof;
    const expectedFields = [
      { name: 'jobId', type: 'uint256' },
      { name: 'nodeId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'completedAt', type: 'uint256' },
      { name: 'preReading', type: 'uint256' },
      { name: 'postReading', type: 'uint256' },
      { name: 'serviceHash', type: 'bytes32' },
    ];

    assert(
      workProofFields.length === expectedFields.length,
      '3a. WorkProof type has exactly 8 fields'
    );

    let typesMatch = true;
    for (let i = 0; i < expectedFields.length; i++) {
      if (
        workProofFields[i].name !== expectedFields[i].name ||
        workProofFields[i].type !== expectedFields[i].type
      ) {
        typesMatch = false;
        break;
      }
    }
    assert(typesMatch, '3b. WorkProof EIP-712 type definition and field ordering matches contract specification');

    // ----------------------------------------------------
    // Test 4: Delta >= minimum check
    // ----------------------------------------------------
    // 4a. 160 - 100 = 60 >= 50 (valid)
    let validDeltaPassed = false;
    try {
      await createDemoWorkProof({
        jobId: 2,
        preReading: 100,
        postReading: 160,
        privateKey: testPrivateKey,
      });
      validDeltaPassed = true;
    } catch {
      validDeltaPassed = false;
    }
    assert(validDeltaPassed, '4a. Delta 60 >= 50 passes construction');

    // 4b. 120 - 100 = 20 < 50 (invalid delta)
    let lowDeltaRejected = false;
    try {
      await createDemoWorkProof({
        jobId: 2,
        preReading: 100,
        postReading: 120,
        privateKey: testPrivateKey,
      });
    } catch (err: any) {
      lowDeltaRejected = err.message.includes('Insufficient delta');
    }
    assert(lowDeltaRejected, '4b. Delta 20 < 50 is rejected with Insufficient delta error');

    // 4c. postReading <= preReading
    let negativeDeltaRejected = false;
    try {
      await createDemoWorkProof({
        jobId: 2,
        preReading: 100,
        postReading: 90,
        privateKey: testPrivateKey,
      });
    } catch (err: any) {
      negativeDeltaRejected = err.message.includes('postReading') && err.message.includes('must be greater than');
    }
    assert(negativeDeltaRejected, '4c. postReading <= preReading is rejected');

    // ----------------------------------------------------
    // Test 5: Wrong job ID rejection
    // ----------------------------------------------------
    let zeroJobRejected = false;
    try {
      await createDemoWorkProof({
        jobId: 0,
        privateKey: testPrivateKey,
      });
    } catch (err: any) {
      zeroJobRejected = err.message.includes('Invalid jobId');
    }
    assert(zeroJobRejected, '5a. jobId = 0 is rejected');

    let negativeJobRejected = false;
    try {
      await createDemoWorkProof({
        jobId: -3,
        privateKey: testPrivateKey,
      });
    } catch (err: any) {
      negativeJobRejected = err.message.includes('Invalid jobId');
    }
    assert(negativeJobRejected, '5b. Negative jobId is rejected');

    let simulatorZeroJobRejected = false;
    try {
      await runDemoSimulator({ jobId: 0, privateKey: testPrivateKey, silent: true });
    } catch (err: any) {
      simulatorZeroJobRejected = err.message.includes('valid positive integer jobId');
    }
    assert(simulatorZeroJobRejected, '5c. Simulator CLI rejects non-positive jobId');

    // ----------------------------------------------------
    // Test 6: No private key printed
    // ----------------------------------------------------
    const capturedLogs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const origInfo = console.info;

    console.log = (...args) => capturedLogs.push(args.map(String).join(' '));
    console.warn = (...args) => capturedLogs.push(args.map(String).join(' '));
    console.error = (...args) => capturedLogs.push(args.map(String).join(' '));
    console.info = (...args) => capturedLogs.push(args.map(String).join(' '));

    try {
      // Execute proof creation and simulator run with captured logs
      jobQueue.clear();
      await runDemoSimulator({
        jobId: 10,
        privateKey: testPrivateKey,
        backendUrl: TEST_BACKEND_URL,
        silent: false,
      });
    } catch {
      // Ignore network errors if any
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      console.info = origInfo;
    }

    const allOutput = capturedLogs.join('\n');
    const privateKeyExposed =
      allOutput.includes(testPrivateKey) ||
      allOutput.includes(testPrivateKey.replace(/^0x/, ''));

    assert(!privateKeyExposed, '6. No private key was logged or printed anywhere in simulator output');

    // ----------------------------------------------------
    // Test 7: Backend reachability & submission
    // ----------------------------------------------------
    jobQueue.clear();
    const result = await runDemoSimulator({
      jobId: 100,
      privateKey: testPrivateKey,
      backendUrl: TEST_BACKEND_URL,
      silent: true,
    });

    assert(result.backendStatus === 200, '7a. Simulator successfully reached backend and received HTTP 200');
    assert(result.backendResponse?.success === true, '7b. Backend validated proof and submitted to relayer');
    assert(Boolean(result.txHash), '7c. Relayer returned transaction hash');
    assert(result.recoveredSigner.toLowerCase() === testWallet.address.toLowerCase(), '7d. Result contains recovered signer');

    // ----------------------------------------------------
    // Test 8: GET /api/device/job/:jobId/status endpoint
    // ----------------------------------------------------
    const statusRes = await fetch(`${TEST_BACKEND_URL}/api/device/job/100/status`);
    const statusBody = await statusRes.json();

    assert(statusRes.status === 200, '8a. GET /api/device/job/100/status returns HTTP 200');
    assert(statusBody.success === true, '8b. Status response has success === true');
    assert(statusBody.jobId === 100, '8c. Status response has correct jobId (100)');
    assert(statusBody.status === 'COMPLETED', '8d. Submitted job status maps to COMPLETED');
    assert(statusBody.preReading === 100, '8e. Status response contains preReading (100)');
    assert(statusBody.postReading === 160, '8f. Status response contains postReading (160)');
    assert(statusBody.delta === 60, '8g. Status response calculates delta (60)');
    assert(statusBody.settlementTxHash === result.txHash, '8h. Status response contains real settlementTxHash');

    const notFoundRes = await fetch(`${TEST_BACKEND_URL}/api/device/job/99999/status`);
    assert(notFoundRes.status === 404, '8i. Non-existent job returns HTTP 404 from status endpoint');

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(` Simulator Tests Completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSimulatorTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

export { runSimulatorTests };
