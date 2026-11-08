import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQuery } from '@tanstack/react-query';
import { getTinanMainnetConfig, getTinanMainnetDiagnostics, type TinanMainnetDiagnostics } from '@workspace/api-client-react';
import { HISTORICAL_TINAN_ADDRESSES, NEW_TINAN_SOURCE_SHA256, NEW_TINAN_RUNTIME_HASH } from '@workspace/tinanai-contracts/mainnet-identity';
import { Btn } from '@/components/kit';
import { Panel, Notice } from '@/components/payment-ui';
import { useAuthedRequest, apiError } from '@/lib/use-tinan-payments';
import { useWeb3Wallet } from '@/lib/web3-wallet';
import { currentWebsite, frontendBuildId } from '@/lib/application-identity';

/** No payment account/catalog hooks, no save action, no simulation or transaction API. */
export function MainnetDeploymentAdmin() {
  const { userId, isSignedIn } = useAuth();
  const authed = useAuthedRequest();
  const wallet = useWeb3Wallet();
  const config = useQuery({
    queryKey: ['mainnet-deployment-config', userId],
    queryFn: async () => getTinanMainnetConfig(await authed()),
    enabled: Boolean(isSignedIn), retry: false, staleTime: 0, refetchInterval: 30_000,
  });
  const [report, setReport] = useState<TinanMainnetDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    epoch.current++;
    setReport(null); setError(null); setBusy(false);
  }, [userId, config.data?.revision, wallet.account, wallet.chainId, wallet.connectorType, wallet.sessionRevision]);
  useEffect(() => () => { epoch.current++; }, []);
  async function diagnose() {
    const requestEpoch = ++epoch.current;
    setBusy(true); setReport(null); setError(null);
    try {
      const data = await getTinanMainnetDiagnostics(await authed());
      if (requestEpoch === epoch.current) setReport(data);
    } catch (e) { if (requestEpoch === epoch.current) setError(apiError(e)); }
    finally { if (requestEpoch === epoch.current) setBusy(false); }
  }
  const matched = Boolean(wallet.account && config.data?.approvedDeployer
    && wallet.account.toLowerCase() === config.data.approvedDeployer.toLowerCase());
  const walletPass = matched && wallet.connectorType === 'walletConnect' && wallet.chainId === 1;
  const payment = config.data?.payment;
  const paymentConfigured = Boolean(payment?.chainId === 1 && payment.tokenAddress && payment.treasuryAddress && payment.tinanPerEur);
  return <Panel title="New TinanAiToken — Mainnet preparation" eyebrow="Read-only · Administrator only" id="panel-mainnet-deployment">
    <div className="space-y-4">
      <Notice tone="warn">Preparation only. No deployment is authorized. TinanAi / TINAN / 18 decimals / fixed 100,000,000 supply. No Core deployment.</Notice>
      <section className="space-y-2 text-xs" aria-label="Application and payment state" data-testid="admin-application-state">
        <h3 className="font-semibold">Application identity — live browser and API snapshot</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['Application environment (API)', config.data?.application?.environment ?? 'Unavailable'],
            ['Current website URL', currentWebsite()],
            ['Frontend build / Git commit', frontendBuildId ?? 'Unavailable — no embedded build identity'],
            ['API build / Git commit', config.data?.application?.buildId ?? 'Unavailable — API not built with identity'],
            ['Payment chain ID', payment?.chainId],
            ['Payment confirmations', payment?.confirmations],
            ['Checkout configuration', payment ? payment.enabled ? 'Enabled' : 'Disabled' : 'Unavailable'],
            ['Payment token address', payment ? payment.tokenAddress ?? 'Not configured' : 'Unavailable'],
            ['Treasury address', payment ? payment.treasuryAddress ?? 'Not configured' : 'Unavailable'],
            ['Conversion rate (TINAN / EUR)', payment ? payment.tinanPerEur ?? 'Not configured' : 'Unavailable'],
          ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono">{value ?? 'Unavailable'}</dd></div>)}
        </dl>
        <p>Read at {config.dataUpdatedAt ? new Date(config.dataUpdatedAt).toISOString() : 'Not yet read'}. Wallet network and payment network are independent.</p>
        <ul className="space-y-1" data-testid="separate-readiness">
          <li>Wallet readiness: {walletPass ? 'PASS — provider account/network match saved approval' : 'BLOCKED — no matching verified WalletConnect observation'}</li>
          <li>Token deployment readiness: BLOCKED — no deployment or simulation authorization. Source checks are not deployment permission.</li>
          <li>Payment readiness: {paymentConfigured ? 'NOT VERIFIED — configuration present; deployed token checks are separate' : 'BLOCKED — verified Mainnet payment configuration is incomplete'}</li>
          <li>Checkout readiness: {payment?.enabled ? 'NOT VERIFIED — enabled configuration is not proof of usable checkout' : 'BLOCKED — checkout disabled or configuration unavailable'}</li>
        </ul>
      </section>
      <section className="space-y-2 text-xs" aria-label="New token identity">
        <p>Source SHA-256: <code className="break-all">{NEW_TINAN_SOURCE_SHA256}</code></p>
        <p>Runtime Keccak-256: <code className="break-all">{NEW_TINAN_RUNTIME_HASH}</code></p>
        <p>These historical TINAN contracts exist, remain unchanged, and are NOT this new deployment identity:</p>
        <ul className="space-y-1">{HISTORICAL_TINAN_ADDRESSES.map(address => <li className="break-all font-mono" key={address}>{address}</li>)}</ul>
      </section>
      {!isSignedIn && <Notice tone="warn">Sign in with the authorized administrator account to inspect saved approval and run server diagnostics.</Notice>}
      {config.isError && <Notice tone="warn">{apiError(config.error)}</Notice>}
      <section className="space-y-2 text-xs" aria-label="Read-only WalletConnect Status" data-testid="admin-wallet-status">
        <h3 className="font-semibold">WalletConnect / authorized deployer / network</h3>
        <p>Saved deployer and intended initialHolder: <code className="break-all">{config.data?.approvedDeployer ?? 'Not verified'}</code></p>
        <p>Active provider account: <code className="break-all">{wallet.account ?? 'Not observed'}</code></p>
        <p>Connector: {wallet.connectorType ?? 'None'} · Wallet chain ID: {wallet.chainId ?? 'Unknown'}</p>
        <p data-testid="wallet-readonly-result">{walletPass ? 'PASS — existing WalletConnect account matches approval on chain ID 1.' : 'BLOCKED — refresh an existing WalletConnect session; the approved address and chain ID 1 must match.'}</p>
        <Btn disabled={!wallet.sessionActive} onClick={() => void wallet.refreshSession()} data-testid="button-admin-wallet-refresh">Read existing wallet session</Btn>
        <p>This action requests only eth_accounts and eth_chainId. It does not pair, switch networks, request a signature or request transaction permissions. Connect through your normal wallet controls separately. An injected connector is not WalletConnect.</p>
        <p>Account/network changes and disconnect/expiry invalidate observations immediately. Provider observations are not cryptographic ownership proof.</p>
        {wallet.error && <Notice tone="warn">{wallet.error}</Notice>}
      </section>
      <div className="flex flex-wrap gap-2">
        <Btn disabled={busy || !config.data} onClick={() => void diagnose()} data-testid="button-mainnet-rpc-diagnostics">{busy ? 'Reading…' : 'Read server RPC diagnostics'}</Btn>
        <Btn disabled title="Separate authorization for creation-code simulation is required." data-testid="button-mainnet-gas-disabled">Gas simulation — disabled</Btn>
      </div>
      <p className="text-xs text-muted-foreground">Gas estimation executes creation code on the RPC node. It is NOT part of these diagnostics and remains disabled. No signature, simulation, database write or payment catalog initialization is requested.</p>
      {error && <Notice tone="warn">{error}</Notice>}
      {report && <section className="space-y-3 text-xs" data-testid="mainnet-diagnostics-report">
        <p>Checked {report.checkedAt}. Snapshot only; not deployment authorization.</p>
        <ul className="space-y-2">{report.checks.map(check => <li key={check.id}><strong>{check.status} — {check.label}</strong><p className="text-muted-foreground">{check.detail}</p></li>)}</ul>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['RPC result', report.rpc.status], ['RPC chain ID', report.rpc.chainId],
            ['Block number', report.rpc.blockNumber], ['Block hash', report.rpc.blockHash],
            ['Block time', report.rpc.blockTime], ['Approved deployer ETH balance', report.rpc.balanceEth],
            ['Confirmed nonce', report.rpc.nonce], ['Pending nonce', report.rpc.pendingNonce],
            ['Actual creation bytecode hash', report.creationBytecodeHash], ['Target identity', report.targetId],
          ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-mono">{value ?? 'Unavailable'}</dd></div>)}
        </dl>
      </section>}
      <Notice tone="warn">These reads do not change the displayed payment configuration. Wallet chain ID 1 does not select payment Mainnet. Existing confirmation values are shown from the database, not an assumed baseline. Deployment and checkout activation require separate explicit authorization; one readiness result does not approve another.</Notice>
    </div>
  </Panel>;
}
