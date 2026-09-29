'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  isWalletAvailable,
  getInjectedProvider,
  connectWallet as connectWalletWeb3,
  getConnectedAccount,
  getConnectedChainId,
  switchToMstTestnet as switchNetworkWeb3,
  getMstBalance,
} from './web3';
import { MST_CHAIN_ID } from './config';

export interface WalletState {
  account: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  balance: string | null;
  isConnecting: boolean;
  isMounted: boolean;
  error: string | null;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function useWalletInternal(): WalletState {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCorrectNetwork = chainId === MST_CHAIN_ID;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (account && isCorrectNetwork) {
      try {
        const bal = await getMstBalance(account);
        setBalance(bal);
      } catch (err) {
        console.error('[useWallet] Failed to fetch balance:', err);
      }
    } else {
      setBalance(null);
    }
  }, [account, isCorrectNetwork]);

  useEffect(() => {
    let mounted = true;
    setIsMounted(true);

    async function checkState() {
      const provider = getInjectedProvider();
      if (!provider) return;

      try {
        const [acc, chain] = await Promise.all([
          getConnectedAccount(),
          getConnectedChainId(),
        ]);

        if (mounted) {
          if (acc) {
            setAccount(acc);
            setError(null);
          }
          if (chain !== null) {
            setChainId(chain);
          }
          if (acc && chain === MST_CHAIN_ID) {
            getMstBalance(acc).then((bal) => {
              if (mounted) setBalance(bal);
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[useWallet] Initialization check error:', err);
      }
    }

    checkState();

    // Listen for late extension injection (BridgeKey, MetaMask, EIP-6963)
    if (typeof window !== 'undefined') {
      window.addEventListener('ethereum#initialized', checkState, { once: true });
      window.addEventListener('bridgekey#initialized', checkState, { once: true });
      window.addEventListener('eip6963:announceProvider', checkState);
    }

    // Attach EIP-1193 accountsChanged and chainChanged listeners
    const provider = getInjectedProvider();
    const handleAccountsChanged = (accounts: string[]) => {
      if (!mounted) return;
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        setError(null);
        getMstBalance(accounts[0]).then((bal) => {
          if (mounted) setBalance(bal);
        }).catch(() => {});
      } else {
        setAccount(null);
        setBalance(null);
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      if (!mounted) return;
      const newChainId = parseInt(chainIdHex, 16);
      setChainId(newChainId);
      setError(null);
      if (account && newChainId === MST_CHAIN_ID) {
        getMstBalance(account).then((bal) => {
          if (mounted) setBalance(bal);
        }).catch(() => {});
      }
    };

    if (provider?.on) {
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
    }

    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('ethereum#initialized', checkState);
        window.removeEventListener('bridgekey#initialized', checkState);
        window.removeEventListener('eip6963:announceProvider', checkState);
      }
      if (provider?.removeListener) {
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [account]);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      const msg = 'No BridgeKey or Web3 wallet detected. Please ensure your BridgeKey wallet extension is installed and active.';
      console.warn('[useWallet]', msg);
      setError(msg);
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const res = await connectWalletWeb3();
      setAccount(res.address);
      setChainId(res.chainId);
      if (res.chainId === MST_CHAIN_ID) {
        const bal = await getMstBalance(res.address);
        setBalance(bal);
      }
    } catch (err: any) {
      console.error('[useWallet] Connection error:', err);
      if (err.code === 4001 || err?.message?.includes('rejected')) {
        setError('Wallet connection was rejected by user.');
      } else {
        setError(err.message || 'Failed to connect wallet.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!isWalletAvailable()) {
      setError('No browser wallet available to switch network.');
      return;
    }
    setError(null);
    try {
      await switchNetworkWeb3();
      const newChainId = await getConnectedChainId();
      setChainId(newChainId);
      if (account && newChainId === MST_CHAIN_ID) {
        const bal = await getMstBalance(account);
        setBalance(bal);
      }
    } catch (err: any) {
      console.error('[useWallet] Network switch error:', err);
      if (err.code === 4001 || err?.message?.includes('rejected')) {
        setError('Network switch was rejected by user.');
      } else {
        setError(err.message || 'Failed to switch network to MST Testnet.');
      }
    }
  }, [account]);

  return {
    account,
    chainId,
    isCorrectNetwork,
    balance,
    isConnecting,
    isMounted,
    error,
    connect,
    switchNetwork,
    refreshBalance,
    clearError,
  };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const state = useWalletInternal();
  return React.createElement(WalletContext.Provider, { value: state }, children);
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (context) {
    return context;
  }
  // Safe fallback if component is rendered outside of WalletProvider
  return useWalletInternal();
}
