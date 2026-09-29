import { ethers } from 'ethers';
import {
  MST_CHAIN_ID,
  MST_CHAIN_ID_HEX,
  MST_RPC_URL,
  MST_NETWORK_CONFIG,
  MACHINE_MANDI_CONTRACT_ADDRESS,
} from './config';
import MachineMandiAbi from './abi/MachineMandi.json';

/**
 * Trust & Architecture Rules:
 * 1. The browser wallet represents the BUYER (the user who pays for machine services).
 * 2. The backend relayer wallet is completely separate and pays gas for submitting verified proofs.
 * 3. The frontend NEVER stores, handles, or requests private keys.
 * 4. The frontend NEVER displays the backend relayer address as the connected user's wallet.
 */

// Declare window.ethereum and window.bridgekey typing for EIP-1193 compatibility
declare global {
  interface Window {
    bridgekey?: {
      isBridgeKey?: boolean;
      request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
      on?: (eventName: string, handler: (...args: any[]) => void) => void;
      removeListener?: (eventName: string, handler: (...args: any[]) => void) => void;
    };
    bridgeKey?: {
      isBridgeKey?: boolean;
      request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
      on?: (eventName: string, handler: (...args: any[]) => void) => void;
      removeListener?: (eventName: string, handler: (...args: any[]) => void) => void;
    };
    ethereum?: {
      isMetaMask?: boolean;
      isBridgeKey?: boolean;
      providers?: Array<any>;
      request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
      on?: (eventName: string, handler: (...args: any[]) => void) => void;
      removeListener?: (eventName: string, handler: (...args: any[]) => void) => void;
    };
  }
}

export interface CreatedJobResult {
  jobId: number;
  nodeId: number;
  buyer: string;
  amount: string; // in MST
  deadline: number;
  nonce: number;
  transactionHash: string;
  blockNumber: number;
}

/**
 * Resolves the active EIP-1193 provider supporting BridgeKey and standard Web3 wallets:
 * 1. window.bridgekey (native BridgeKey extension provider)
 * 2. window.bridgeKey
 * 3. window.ethereum.providers (if multiple extensions, find BridgeKey or return primary)
 * 4. window.ethereum (standard EIP-1193 provider, e.g. MetaMask, BridgeKey)
 */
export function getInjectedProvider(): any {
  if (typeof window === 'undefined') return null;

  const win = window as any;

  // 1. Dedicated BridgeKey provider
  if (win.bridgekey && typeof win.bridgekey.request === 'function') {
    return win.bridgekey;
  }
  if (win.bridgeKey && typeof win.bridgeKey.request === 'function') {
    return win.bridgeKey;
  }

  // 2. Multi-provider array (EIP-5749 / EIP-1193 standard when multiple wallets are active)
  if (win.ethereum?.providers && Array.isArray(win.ethereum.providers)) {
    const bridgeKeyProvider = win.ethereum.providers.find(
      (p: any) => p && (p.isBridgeKey || p.isBridgekey || p.bridgekey)
    );
    if (bridgeKeyProvider && typeof bridgeKeyProvider.request === 'function') {
      return bridgeKeyProvider;
    }
    const validProvider = win.ethereum.providers.find((p: any) => p && typeof p.request === 'function');
    if (validProvider) {
      return validProvider;
    }
  }

  // 3. Standard window.ethereum (MetaMask, BridgeKey injected as window.ethereum, etc.)
  if (win.ethereum && typeof win.ethereum.request === 'function') {
    return win.ethereum;
  }

  return null;
}

/**
 * 1. Detect whether a browser wallet (BridgeKey or standard EIP-1193) is present.
 */
export function isWalletAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(getInjectedProvider());
}

/**
 * 6. Create an ethers BrowserProvider from the active injected provider.
 */
export function getBrowserProvider(): ethers.BrowserProvider {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('No BridgeKey or compatible Web3 wallet detected. Please install BridgeKey or MetaMask.');
  }
  return new ethers.BrowserProvider(provider);
}

/**
 * Detects whether an error originates from an HTTP 429 / rate-limiting condition.
 */
export function isRateLimitError(err: any): boolean {
  if (!err) return false;
  if (typeof err === 'string') {
    const s = err.toLowerCase();
    return (
      s.includes('429') ||
      s.includes('too many requests') ||
      s.includes('rate limit') ||
      s.includes('ratelimit') ||
      s.includes('limit exceeded') ||
      s.includes('throttl')
    );
  }
  let serializedError = '';
  try {
    serializedError = JSON.stringify(err.error || {});
  } catch {}
  let serializedInfo = '';
  try {
    serializedInfo = JSON.stringify(err.info || {});
  } catch {}

  const str = (
    (err.message || '') +
    ' ' +
    (err.reason || '') +
    ' ' +
    (err.shortMessage || '') +
    ' ' +
    (typeof err.error === 'string' ? err.error : (err.error?.message || '')) +
    ' ' +
    (err.cause?.message || '') +
    ' ' +
    serializedError +
    ' ' +
    serializedInfo
  ).toLowerCase();

  return (
    str.includes('429') ||
    str.includes('too many requests') ||
    str.includes('rate limit') ||
    str.includes('ratelimit') ||
    str.includes('limit exceeded') ||
    str.includes('throttl') ||
    err.status === 429 ||
    err.statusCode === 429 ||
    err?.info?.response?.status === 429 ||
    err?.error?.code === 429 ||
    err?.error?.status === 429
  );
}

let readOnlyProviderInstance: ethers.JsonRpcProvider | null = null;

/**
 * Fallback read-only provider connected directly to MST Testnet RPC.
 * Cached as a singleton with staticNetwork to prevent repeated eth_chainId queries.
 */
export function getReadOnlyProvider(): ethers.JsonRpcProvider {
  if (!readOnlyProviderInstance) {
    const network = ethers.Network.from({
      name: 'mst-testnet',
      chainId: MST_CHAIN_ID,
    });
    readOnlyProviderInstance = new ethers.JsonRpcProvider(MST_RPC_URL, network, {
      staticNetwork: network,
    });
  }
  return readOnlyProviderInstance;
}

/**
 * 7. Obtain the JsonRpcSigner representing the connected BUYER account.
 */
export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  const provider = getBrowserProvider();
  return provider.getSigner();
}

/**
 * 4. Detect current chain ID from the connected wallet.
 */
export async function getConnectedChainId(): Promise<number | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
  } catch (error) {
    console.error('[Web3] Failed to get chainId:', error);
    return null;
  }
}

/**
 * 3. Return the currently connected BUYER account (without triggering a connection popup).
 */
export async function getConnectedAccount(): Promise<string | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const accounts: string[] = await provider.request({ method: 'eth_accounts' });
    return accounts && accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error('[Web3] Failed to get connected account:', error);
    return null;
  }
}

/**
 * 5. Request network switch or add MST Testnet to user's wallet.
 */
export async function switchToMstTestnet(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('No browser wallet available to switch network');
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MST_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // Error code 4902 means the chain has not been added to the wallet
    if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [MST_NETWORK_CONFIG],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * 2. Connect the BUYER's wallet and ensure MST Testnet is selected.
 */
export async function connectWallet(): Promise<{ address: string; chainId: number }> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('No BridgeKey or compatible Web3 wallet detected. Please install BridgeKey or MetaMask.');
  }

  const accounts: string[] = await provider.request({
    method: 'eth_requestAccounts',
  });

  if (!accounts || accounts.length === 0) {
    throw new Error('User rejected connection or no accounts available');
  }

  let currentChainId = await getConnectedChainId();
  if (currentChainId !== MST_CHAIN_ID) {
    try {
      await switchToMstTestnet();
      currentChainId = await getConnectedChainId();
    } catch (switchError) {
      console.warn('[Web3] Could not automatically switch network:', switchError);
    }
  }

  const updatedChainId = currentChainId || (await getConnectedChainId()) || MST_CHAIN_ID;
  return {
    address: accounts[0],
    chainId: updatedChainId,
  };
}

/**
 * 8. Create the MachineMandi contract instance.
 * If runner (Signer or Provider) is not provided, defaults to read-only JsonRpcProvider.
 */
export function getMachineMandiContract(
  runner?: ethers.ContractRunner
): ethers.Contract {
  const effectiveRunner = runner || getReadOnlyProvider();
  return new ethers.Contract(
    MACHINE_MANDI_CONTRACT_ADDRESS,
    MachineMandiAbi,
    effectiveRunner
  );
}

let lastKnownBalance: Record<string, string> = {};

/**
 * 9. Read the native MST balance for any given address.
 * Resilient against temporary RPC 429 rate-limiting.
 */
export async function getMstBalance(address: string): Promise<string> {
  const addrKey = address.toLowerCase();
  try {
    const provider = isWalletAvailable() ? getBrowserProvider() : getReadOnlyProvider();
    const balanceWei = await provider.getBalance(address);
    const formatted = ethers.formatEther(balanceWei);
    lastKnownBalance[addrKey] = formatted;
    return formatted;
  } catch (err: any) {
    if (isRateLimitError(err) && lastKnownBalance[addrKey]) {
      console.warn('[Web3] getMstBalance rate-limited; returning last known balance.');
      return lastKnownBalance[addrKey];
    }
    console.warn('[Web3] Could not read balance:', err?.message || err);
    return lastKnownBalance[addrKey] || '0.0';
  }
}

/**
 * 10. Prepare or populate the createJob transaction for buyer execution.
 *
 * Contract signature:
 * function createJob(uint256 nodeId, uint256 deadline) external payable returns (uint256 jobId)
 */
export async function prepareCreateJobTx(
  nodeId: number,
  deadline: number,
  priceMst: string | number
): Promise<{ to: string; data: string; value: bigint }> {
  const contract = getMachineMandiContract();
  const priceWei = ethers.parseEther(String(priceMst));
  const data = contract.interface.encodeFunctionData('createJob', [
    BigInt(nodeId),
    BigInt(deadline),
  ]);

  return {
    to: MACHINE_MANDI_CONTRACT_ADDRESS,
    data,
    value: priceWei,
  };
}

/**
 * Parses the JobCreated event from transaction receipt logs.
 */
export function parseJobCreatedEvent(
  receipt: ethers.ContractTransactionReceipt,
  contractInterface: ethers.Interface
): CreatedJobResult | null {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && parsed.name === 'JobCreated') {
        return {
          jobId: Number(parsed.args.jobId),
          nodeId: Number(parsed.args.nodeId),
          buyer: parsed.args.buyer,
          amount: ethers.formatEther(parsed.args.amount),
          deadline: Number(parsed.args.deadline),
          nonce: Number(parsed.args.nonce),
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
      }
    } catch {
      // Ignore logs that don't match this contract event
    }
  }
  return null;
}

/**
 * Executes a REAL MachineMandi createJob(nodeId, deadline) transaction.
 *
 * 1. Obtains the connected buyer signer.
 * 2. Sets deadline = current block / unix timestamp + 3600 seconds.
 * 3. Sends value = node.price (e.g. 0.0001 MST).
 * 4. Waits for transaction confirmation receipt.
 * 5. Parses JobCreated event to extract the real jobId.
 */
export async function executeCreateJob(
  nodeId: number,
  priceMst: string | number,
  options?: {
    deadlineSeconds?: number;
    onBroadcast?: (txHash: string) => void;
  }
): Promise<CreatedJobResult> {
  const currentChainId = await getConnectedChainId();
  if (currentChainId !== MST_CHAIN_ID) {
    throw new Error(`Connected to wrong network (Chain ID: ${currentChainId}). Please switch to MST Testnet (Chain ID: ${MST_CHAIN_ID}).`);
  }

  const signer = await getSigner();
  const contract = getMachineMandiContract(signer);
  const priceWei = ethers.parseEther(String(priceMst));
  const deadline = Math.floor(Date.now() / 1000) + (options?.deadlineSeconds || 3600);

  // Send real createJob transaction from BUYER wallet into smart contract escrow.
  // Overriding gasLimit (300,000 gas) prevents the pre-flight eth_estimateGas RPC call,
  // which frequently triggers HTTP 429 on rate-limited public RPC nodes.
  let tx: ethers.ContractTransactionResponse;
  try {
    tx = await contract.createJob(
      BigInt(nodeId),
      BigInt(deadline),
      {
        value: priceWei,
        gasLimit: BigInt(300000),
      }
    );
  } catch (txError: any) {
    if (isRateLimitError(txError)) {
      const err = new Error('MST Testnet RPC is temporarily rate-limited. Please wait a moment and retry.');
      (err as any).code = 429;
      (err as any).isRateLimit = true;
      (err as any).cause = txError;
      throw err;
    }
    throw txError;
  }

  if (options?.onBroadcast) {
    options.onBroadcast(tx.hash);
  }

  // Wait for block confirmation on MST Testnet
  let receipt: ethers.ContractTransactionReceipt | null = null;
  try {
    receipt = await tx.wait();
  } catch (waitError: any) {
    if (isRateLimitError(waitError)) {
      const err = new Error('MST Testnet RPC is temporarily rate-limited while confirming transaction. Transaction hash: ' + tx.hash);
      (err as any).code = 429;
      (err as any).txHash = tx.hash;
      throw err;
    }
    throw waitError;
  }

  if (!receipt) {
    throw new Error('Transaction execution failed: No block receipt returned by MST Testnet.');
  }

  const createdJob = parseJobCreatedEvent(receipt, contract.interface);
  if (!createdJob) {
    throw new Error(
      `Transaction confirmed in block ${receipt.blockNumber} (${receipt.hash}), but JobCreated event could not be parsed.`
    );
  }

  return createdJob;
}

export interface RefundJobResult {
  jobId: number;
  transactionHash: string;
  blockNumber: number;
}

/**
 * Executes a REAL MachineMandi refund(jobId) transaction.
 *
 * 1. Verifies that the connected wallet is on MST Testnet (Chain ID 91562037).
 * 2. Obtains the connected buyer signer from BridgeKey.
 * 3. Pre-verifies on-chain eligibility (job.status == STATUS_OPEN and block.timestamp > job.deadline).
 * 4. Sends real refund(jobId) transaction via user's BridgeKey wallet.
 * 5. Overrides gasLimit (200,000 gas) to prevent pre-flight eth_estimateGas 429 rate-limiting.
 * 6. Waits for block confirmation receipt.
 * 7. Returns real transaction hash and block number.
 */
export async function executeRefundJob(
  jobId: number,
  options?: {
    onBroadcast?: (txHash: string) => void;
  }
): Promise<RefundJobResult> {
  const currentChainId = await getConnectedChainId();
  if (currentChainId !== MST_CHAIN_ID) {
    throw new Error('Switch to MST Testnet.');
  }

  const signer = await getSigner();
  const contract = getMachineMandiContract(signer);

  // Pre-check on-chain state to provide immediate clean error before prompting wallet
  try {
    const rawJob = await contract.getJob(BigInt(jobId));
    const status = Number(rawJob.status ?? rawJob[6]);
    const deadline = Number(rawJob.deadline ?? rawJob[4]);

    if (status === 1) {
      throw new Error('Job is already completed; escrow has been released.');
    }
    if (status === 2) {
      throw new Error('Escrow has already been refunded.');
    }
    if (status !== 0) {
      throw new Error('Refund transaction failed. The job may no longer be refundable.');
    }

    const currentBlock = await signer.provider?.getBlock('latest');
    const currentTimestamp = currentBlock?.timestamp ?? Math.floor(Date.now() / 1000);
    if (currentTimestamp <= deadline) {
      throw new Error('Refund is not available yet.');
    }
  } catch (err: any) {
    if (err.message && (
      err.message.includes('already completed') ||
      err.message.includes('already been refunded') ||
      err.message.includes('not available') ||
      err.message.includes('longer be refundable')
    )) {
      throw err;
    }
    // If read fails (e.g. transient RPC rate limit), proceed to allow user to submit transaction
  }

  let tx: ethers.ContractTransactionResponse;
  try {
    tx = await contract.refund(BigInt(jobId), {
      gasLimit: BigInt(200000),
    });
  } catch (txError: any) {
    if (txError.code === 4001 || txError.code === 'ACTION_REJECTED') {
      const err = new Error('Transaction rejected in wallet.');
      (err as any).code = 4001;
      throw err;
    }
    if (isRateLimitError(txError)) {
      const err = new Error('MST Testnet RPC is temporarily rate-limited. Please wait and try again.');
      (err as any).code = 429;
      (err as any).isRateLimit = true;
      (err as any).cause = txError;
      throw err;
    }
    const msg = (txError.message || txError.reason || '').toLowerCase();
    if (msg.includes('jobalreadyrefunded') || msg.includes('already refunded')) {
      throw new Error('Escrow has already been refunded.');
    }
    if (msg.includes('jobnotopen') || msg.includes('already completed')) {
      throw new Error('Job is already completed; escrow has been released.');
    }
    if (msg.includes('deadlinenotpassed') || msg.includes('deadline not passed') || msg.includes('deadline')) {
      throw new Error('Refund is not available yet.');
    }
    const err = new Error('Refund transaction failed. The job may no longer be refundable.');
    (err as any).cause = txError;
    throw err;
  }

  if (options?.onBroadcast) {
    options.onBroadcast(tx.hash);
  }

  let receipt: ethers.ContractTransactionReceipt | null = null;
  try {
    receipt = await tx.wait();
  } catch (waitError: any) {
    if (isRateLimitError(waitError)) {
      const err = new Error('MST Testnet RPC is temporarily rate-limited while confirming transaction. Transaction hash: ' + tx.hash);
      (err as any).code = 429;
      (err as any).txHash = tx.hash;
      throw err;
    }
    throw waitError;
  }

  if (!receipt || receipt.status !== 1) {
    throw new Error('Refund transaction failed. The job may no longer be refundable.');
  }

  return {
    jobId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}
