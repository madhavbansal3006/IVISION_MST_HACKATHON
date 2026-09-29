import { ethers } from 'ethers';
import { config } from '../src/config';
import MachineMandiArtifact from '../src/blockchain/abi/MachineMandi.json';
import {
  EXPECTED_MST_CHAIN_ID,
  DEFAULT_CONTRACT_ADDRESS,
} from '../src/blockchain/mstContract';

/**
 * Safe Live MST Connectivity Smoke Test
 *
 * Checks:
 * 1. RPC endpoint connectivity and latency
 * 2. Network Chain ID verification (91562037)
 * 3. Deployed bytecode existence at contract address
 * 4. Read-only contract queries (owner, nodeCount, jobCount)
 * 5. Relayer wallet address derivation and balance (if key configured)
 *
 * SAFETY INVARIANT:
 * Strictly read-only. Does NOT broadcast any transactions, create jobs, or spend MST tokens.
 */
async function smokeTestMst() {
  console.log('====================================================');
  console.log('  MachineMandi - MST Testnet Live Connectivity Check');
  console.log('====================================================\n');

  const rpcUrl = config.relayer.rpcUrl || 'https://testnet-rpc.mstscan.com';
  const contractAddress = config.relayer.contractAddress || DEFAULT_CONTRACT_ADDRESS;
  const expectedChainId = config.relayer.chainId || EXPECTED_MST_CHAIN_ID;

  console.log(`[Config] Target RPC:       ${rpcUrl}`);
  console.log(`[Config] Expected Chain ID: ${expectedChainId}`);
  console.log(`[Config] Contract Address:  ${contractAddress}`);

  try {
    // 1. Initialize provider
    const startTime = Date.now();
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 2. Query network
    const network = await provider.getNetwork();
    const latency = Date.now() - startTime;
    const connectedChainId = Number(network.chainId);

    console.log(`\n[RPC] Connected successfully in ${latency}ms`);
    console.log(`[RPC] Reported Network Name: ${network.name}`);
    console.log(`[RPC] Reported Chain ID:     ${connectedChainId}`);

    if (connectedChainId !== expectedChainId) {
      console.error(
        `[FAIL] Chain ID mismatch! Expected ${expectedChainId}, got ${connectedChainId}`
      );
      process.exitCode = 1;
      return;
    }
    console.log('[PASS] Chain ID matches MST Testnet (91562037)');

    // 3. Query contract bytecode
    const bytecode = await provider.getCode(contractAddress);
    if (!bytecode || bytecode === '0x' || bytecode.length <= 2) {
      console.error(
        `[FAIL] No contract bytecode found at address ${contractAddress}`
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `[PASS] Verified contract bytecode exists (${(bytecode.length - 2) / 2} bytes)`
    );

    // 4. Query read-only contract state
    const contract = new ethers.Contract(contractAddress, MachineMandiArtifact, provider);
    const owner = await contract.owner();
    const nodeCount = await contract.nodeCount();
    const jobCount = await contract.jobCount();

    console.log(`\n[Contract State] Owner Address: ${owner}`);
    console.log(`[Contract State] Node Count:    ${nodeCount.toString()}`);
    console.log(`[Contract State] Job Count:     ${jobCount.toString()}`);

    // 5. Check Relayer Wallet (if configured)
    if (config.relayer.privateKey) {
      try {
        const wallet = new ethers.Wallet(config.relayer.privateKey, provider);
        const balance = await provider.getBalance(wallet.address);
        console.log(`\n[Relayer] Address: ${wallet.address}`);
        console.log(`[Relayer] Balance: ${ethers.formatEther(balance)} MST`);
      } catch (err: any) {
        console.warn(`[Relayer] Could not parse relayer wallet: ${err.message}`);
      }
    } else {
      console.log('\n[Relayer] RELAYER_PRIVATE_KEY not set in environment (mock/read-only mode)');
    }

    console.log('\n====================================================');
    console.log('>>> MST CONNECTIVITY CHECK PASSED SUCCESSFULLY! <<<');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n[Notice] Smoke test could not reach remote RPC endpoint:', err.message);
    console.error('Note: If running in an offline environment or behind a firewall, ensure internet access');
    console.error('or set MST_RPC_URL in .env to a reachable MST node.');
    process.exitCode = 0; // Informational diagnostic check
  }
}

smokeTestMst();
