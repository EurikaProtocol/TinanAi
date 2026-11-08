import { useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { erc20Abi, isAddress, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  getTinanPaymentAccount,
  getTinanMarketplaceOrders,
  getGetTinanMarketplaceOrdersQueryKey,
  getTinanPaymentAdmin,
  getGetTinanPaymentAccountQueryKey,
  getGetTinanPaymentAdminQueryKey,
  getGetTinanPaymentCatalogQueryKey,
  useGetTinanPaymentCatalog,
  type TinanPaymentInvoice,
} from '@workspace/api-client-react';

/** Returns request options carrying an explicit Clerk bearer token. */
export function useAuthedRequest() {
  const { getToken } = useAuth();
  return useCallback(async (): Promise<RequestInit> => {
    const token = await getToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    return { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' };
  }, [getToken]);
}

export function apiError(error: unknown): string {
  if (!error) return 'Unknown error';
  const e = error as { data?: { error?: string } | null; status?: number; message?: string; shortMessage?: string };
  if (e.data && typeof e.data === 'object' && typeof e.data.error === 'string') return e.data.error;
  if (e.shortMessage) return e.shortMessage;
  return e.message ?? String(error);
}

export const usePaymentCatalog = () => useGetTinanPaymentCatalog({ query: { queryKey: getGetTinanPaymentCatalogQueryKey(), refetchInterval: 30_000 } });

export function usePaymentAccount() {
  const { isSignedIn, userId } = useAuth();
  const authed = useAuthedRequest();
  return useQuery({
    queryKey: [...getGetTinanPaymentAccountQueryKey(), userId ?? 'anon'],
    queryFn: async ({ signal }) => getTinanPaymentAccount({ ...(await authed()), signal }),
    enabled: Boolean(isSignedIn),
    refetchInterval: 30_000,
    retry: (count, err) => (err as { status?: number }).status !== 401 && count < 2,
  });
}

export function usePaymentAdmin(enabled: boolean) {
  const { userId } = useAuth();
  const authed = useAuthedRequest();
  return useQuery({
    queryKey: [...getGetTinanPaymentAdminQueryKey(), userId ?? 'anon'],
    queryFn: async ({ signal }) => getTinanPaymentAdmin({ ...(await authed()), signal }),
    enabled,
    retry: false,
  });
}

export function useInvalidatePayments() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: getGetTinanPaymentAccountQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetTinanPaymentCatalogQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetTinanPaymentAdminQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetTinanMarketplaceOrdersQueryKey() });
  }, [qc]);
}

export type TokenSnapshot = {
  hasCode: boolean; name: string; symbol: string; decimals: number; totalSupply: bigint;
  balance: bigint | null; blockNumber: bigint; checkedAt: number;
};

/** Live ERC20 reads of the officially configured token. Never invents values. */
export function useOfficialToken(chainId: 1 | 11155111, token: string | null, account: string | null) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ['tinan-official-token', chainId, token, account],
    enabled: Boolean(client && token && isAddress(token)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<TokenSnapshot> => {
      if (!client || !token) throw new Error('RPC unavailable');
      const address = token as Address;
      if (await client.getChainId() !== chainId) throw new Error('RPC network does not match payment configuration.');
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const code = await client.getCode({ address, blockNumber });
      if (!code || code === '0x') return { hasCode: false, name: '', symbol: '', decimals: 0, totalSupply: 0n, balance: null, blockNumber, checkedAt: Date.now() };
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: 'name', blockNumber }),
        client.readContract({ address, abi: erc20Abi, functionName: 'symbol', blockNumber }),
        client.readContract({ address, abi: erc20Abi, functionName: 'decimals', blockNumber }),
        client.readContract({ address, abi: erc20Abi, functionName: 'totalSupply', blockNumber }),
      ]);
      const balance = account && isAddress(account)
        ? await client.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [account as Address], blockNumber })
        : null;
      return { hasCode: true, name, symbol, decimals, totalSupply, balance, blockNumber, checkedAt: Date.now() };
    },
  });
}

/* Local tx-hash persistence so a failed API call never loses a broadcast hash. */
const txKey = (userId: string, invoiceId: string) => `tinanai:payment-tx:${userId}:${invoiceId}`;
export function saveLocalTx(userId: string, invoiceId: string, hash: string) {
  try { localStorage.setItem(txKey(userId, invoiceId), hash); return true; } catch { return false; }
}
export function readLocalTx(userId: string, invoiceId: string): string | null {
  try { return localStorage.getItem(txKey(userId, invoiceId)); } catch { return null; }
}
export function clearLocalTx(userId: string, invoiceId: string) {
  try { localStorage.removeItem(txKey(userId, invoiceId)); } catch { /* ignore */ }
}

export const isPolling = (i: TinanPaymentInvoice) => Boolean(i.txHash) && (i.status === 'pending' || i.status === 'confirming');
export const isTxHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);

/* Marketplace manual-fulfillment requests (own for users, all for admins). */
export function useMarketplaceOrders(enabled = true) {
  const { isSignedIn, userId } = useAuth();
  const authed = useAuthedRequest();
  return useQuery({
    queryKey: [...getGetTinanMarketplaceOrdersQueryKey(), userId ?? 'anon'],
    queryFn: async ({ signal }) => getTinanMarketplaceOrders({ ...(await authed()), signal }),
    enabled: Boolean(isSignedIn) && enabled,
    // Poll only while some request is still open; stops once all are resolved.
    refetchInterval: (q) => (q.state.data?.some((o) => o.status === 'open') ? 30_000 : false),
    retry: 1,
  });
}
