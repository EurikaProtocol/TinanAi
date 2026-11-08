import { useId } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  Fuel,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Wallet,
  Wifi,
} from 'lucide-react';
import { Badge, Btn, Card, ErrorNote } from '@/components/kit';
import type { LaunchDraft } from '@/lib/store';

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_SCAN = 'https://sepolia.etherscan.io';

export interface LaunchpadDeployPanelProps {
  draft: LaunchDraft;
  account: string | null;
  chainId: number | null;
  walletStatus: 'idle' | 'connecting' | 'wrong-network' | 'unavailable' | 'ready';
  walletError: string | null;
  walletConnectAvailable: boolean;
  deploymentBlockedReason?: string | null;
  mintable: boolean;
  burnable: boolean;
  acknowledgement: boolean;
  deploymentState: 'idle' | 'waiting-wallet' | 'pending' | 'confirming' | 'success' | 'error';
  txHash?: string | null;
  contractAddress?: string | null;
  deploymentError?: string | null;
  deploymentMessage?: string | null;
  onConnectInjected: () => void;
  onConnectWalletConnect: () => void;
  onSwitchToSepolia: () => void;
  onOptions: (option: 'mintable' | 'burnable', enabled: boolean) => void;
  onAcknowledgementChange: (acknowledged: boolean) => void;
  onDeploy: () => void;
  onAddToMetaMask: () => void;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainLabel(chainId: number | null) {
  if (chainId === null) return 'Network not reported';
  if (chainId === SEPOLIA_CHAIN_ID) return 'Sepolia';
  return `Chain ID ${chainId}`;
}

export function LaunchpadDeployPanel({
  draft,
  account,
  chainId,
  walletStatus,
  walletError,
  walletConnectAvailable,
  deploymentBlockedReason = null,
  mintable,
  burnable,
  acknowledgement,
  deploymentState,
  txHash,
  contractAddress,
  deploymentError,
  deploymentMessage,
  onConnectInjected,
  onConnectWalletConnect,
  onSwitchToSepolia,
  onOptions,
  onAcknowledgementChange,
  onDeploy,
  onAddToMetaMask,
}: LaunchpadDeployPanelProps) {
  const acknowledgementId = useId();
  const busy = ['waiting-wallet', 'pending', 'confirming'].includes(deploymentState);
  const deployed = deploymentState === 'success';
  const onSepolia = chainId === SEPOLIA_CHAIN_ID;
  const canDeploy = walletStatus === 'ready' && Boolean(account) && onSepolia && acknowledgement && !busy && !deployed && !deploymentBlockedReason;
  const txUrl = txHash ? `${SEPOLIA_SCAN}/tx/${encodeURIComponent(txHash)}` : null;
  const contractUrl = contractAddress ? `${SEPOLIA_SCAN}/address/${encodeURIComponent(contractAddress)}` : null;

  return (
    <section className="space-y-5" aria-labelledby="deploy-panel-title" data-testid="panel-launchpad-deploy">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">Launchpad / Deployment</p>
          <h2 id="deploy-panel-title" className="mt-2 font-sans text-3xl font-bold tracking-[-.04em]">Review before you sign</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Confirm the proposal, connect an owner wallet, then request a Sepolia transaction. Nothing is submitted until you approve it in your wallet.
          </p>
        </div>
        <Badge tone={deployed ? 'ok' : 'mute'}>{deployed ? 'Sepolia confirmed' : 'Draft · not deployed'}</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-primary/[.055] blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Step 1 / 3 · Review token</p>
              <h3 className="mt-2 break-words font-sans text-2xl font-bold tracking-tight">{draft.name}</h3>
              <p className="mt-1 font-mono text-xs tracking-[.12em] text-primary">{draft.symbol}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CircleDot className="h-3 w-3 text-primary" /> ERC-20
            </span>
          </div>

          <dl className="relative mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Initial whole-unit supply</dt>
              <dd className="mt-1 break-all font-mono text-sm text-foreground" data-testid="text-deploy-supply">{draft.supply}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Decimals</dt>
              <dd className="mt-1 font-mono text-sm text-foreground" data-testid="text-deploy-decimals">18</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Deployment network</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-foreground" data-testid="text-deploy-network">
                <Globe2 className="h-3.5 w-3.5 text-primary" /> Ethereum Sepolia only
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Owner</dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground" data-testid="text-deploy-owner">
                {account || 'Connect a wallet to set the owner'}
              </dd>
            </div>
          </dl>

          <div className="relative mt-5 rounded-lg border border-border bg-background/45 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Optional token controls</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/80 p-3 transition hover:border-primary/35">
                <input
                  type="checkbox"
                  checked={mintable}
                  onChange={(event) => onOptions('mintable', event.currentTarget.checked)}
                  disabled={busy || deployed}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  data-testid="input-option-mintable"
                />
                <span>
                  <span className="block text-xs font-semibold">Mintable</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Allows the owner to create additional tokens after deployment.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/80 p-3 transition hover:border-primary/35">
                <input
                  type="checkbox"
                  checked={burnable}
                  onChange={(event) => onOptions('burnable', event.currentTarget.checked)}
                  disabled={busy || deployed}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  data-testid="input-option-burnable"
                />
                <span>
                  <span className="block text-xs font-semibold">Burnable</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Allows token holders to destroy tokens they hold.</span>
                </span>
              </label>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Both are off unless selected. These choices affect the contract behavior.</p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                 <p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Step 2 / 3</p>
                <h3 className="mt-1 font-sans text-lg font-bold">Connect owner wallet</h3>
              </div>
              <span className={`grid h-9 w-9 place-items-center rounded-full border ${walletStatus === 'ready' && account ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-background/50 text-muted-foreground'}`}>
                {walletStatus === 'connecting' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              </span>
            </div>

            {walletStatus === 'ready' && account ? (
              <div className="rounded-lg border border-primary/25 bg-primary/[.055] p-3" data-testid="status-wallet-connected" role="status">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Wallet connected</div>
                <p className="mt-2 break-all font-mono text-xs text-foreground" title={account}>{shortAddress(account)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Current network: {chainLabel(chainId)}</p>
              </div>
            ) : (
              <>
                {walletStatus === 'unavailable' && (
                  <p className="rounded-md border border-border bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground" role="status" data-testid="status-wallet-unavailable">
                    No injected wallet is available in this browser. Install or enable MetaMask, or use WalletConnect if configured.
                  </p>
                )}
                {walletStatus === 'connecting' && <p className="text-xs text-muted-foreground" role="status" data-testid="status-wallet-connecting">Waiting for wallet connection approval…</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Btn onClick={onConnectInjected} disabled={walletStatus === 'connecting'} data-testid="button-connect-injected">
                    <Wallet className="h-3.5 w-3.5" /> Connect Wallet
                  </Btn>
                  {walletConnectAvailable ? (
                    <Btn onClick={onConnectWalletConnect} disabled={walletStatus === 'connecting'} data-testid="button-connect-walletconnect">
                      <Wifi className="h-3.5 w-3.5" /> WalletConnect
                    </Btn>
                  ) : (
                    <div className="rounded-md border border-border bg-background/35 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="status-walletconnect-unavailable">
                      WalletConnect needs a Reown project ID configured as VITE_REOWN_PROJECT_ID.
                    </div>
                  )}
                </div>
              </>
            )}

            {walletStatus === 'wrong-network' || (account && !onSepolia) ? (
              <div className="rounded-lg border border-amber-400/25 bg-amber-400/[.06] p-3" data-testid="status-wrong-network" role="status">
                <p className="text-xs font-semibold text-amber-100">Sepolia required</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Connected network: {chainLabel(chainId)}. Deployment is limited to Sepolia.</p>
                <Btn size="sm" className="mt-3" onClick={onSwitchToSepolia} data-testid="button-switch-sepolia">Switch to Sepolia</Btn>
              </div>
            ) : null}

            {walletError && <ErrorNote message={walletError} />}
          </Card>

          <div className="rounded-xl border border-amber-300/25 bg-amber-300/[.055] p-4" role="note" data-testid="notice-real-sepolia-transaction">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              <div>
                <h3 className="text-xs font-bold text-amber-100">This is a real Sepolia contract transaction</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-50/75">
                  You need Sepolia test ETH for network gas, and your wallet must approve the transaction. It will create a contract on the Sepolia test network, not an Ethereum mainnet launch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {draft.kind === 'data' && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/[.06] px-4 py-3 text-xs leading-relaxed text-destructive" role="note" data-testid="notice-data-token-chain">
          Only the token name, symbol, supply, owner, and selected token controls are included in this contract. Do not put private data or resource contents on a public chain.
        </p>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
             <p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Step 3 / 3</p>
            <h3 className="mt-1 font-sans text-lg font-bold">Review and deploy</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> You approve in your wallet</span>
        </div>

        <label htmlFor={acknowledgementId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/35 p-3.5">
          <input
            id={acknowledgementId}
            type="checkbox"
            checked={acknowledgement}
            onChange={(event) => onAcknowledgementChange(event.currentTarget.checked)}
            disabled={busy || deployed}
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            data-testid="input-deploy-acknowledgement"
          />
          <span className="text-xs leading-relaxed text-foreground/85">
            I have reviewed the name, symbol, supply, owner and optional controls. I understand this requests a real Sepolia transaction that may use test ETH, and I must approve it in my wallet.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="gold" onClick={onDeploy} disabled={!canDeploy} data-testid="button-deploy-token">
            <ArrowUpRight className="h-4 w-4" />
            {busy ? 'Transaction in progress' : deployed ? 'Deployment confirmed' : 'Request deployment'}
          </Btn>
          {!canDeploy && !busy && !deployed && (
            <p className="text-[11px] text-muted-foreground" data-testid="status-deploy-prerequisites">
              {deploymentBlockedReason || (!account || walletStatus !== 'ready' ? 'Connect a wallet to continue.' : !onSepolia ? 'Switch to Sepolia to continue.' : !acknowledgement ? 'Acknowledge the transaction details to continue.' : 'Deployment is not available.')}
            </p>
          )}
        </div>

        {deploymentState === 'waiting-wallet' && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[.055] p-3.5" role="status" data-testid="status-deployment-waiting-wallet">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-foreground/85">{deploymentMessage || 'Check your wallet and approve or reject the Sepolia transaction.'}</p>
          </div>
        )}
        {(deploymentState === 'pending' || deploymentState === 'confirming') && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[.055] p-3.5" role="status" aria-live="polite" data-testid="status-deployment-pending">
            {deploymentState === 'pending' ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div>
              <p className="text-xs font-semibold text-foreground">{deploymentState === 'pending' ? 'Transaction submitted; awaiting confirmation' : 'Transaction is confirming on Sepolia'}</p>
              {deploymentMessage && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{deploymentMessage}</p>}
            </div>
          </div>
        )}
        {deploymentState === 'error' && (
          <ErrorNote message={deploymentError || deploymentMessage || 'The deployment request did not complete. Check your wallet and try again when ready.'} />
        )}
        {deploymentState === 'success' && (
          <div className="space-y-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[.055] p-4" role="status" aria-live="polite" data-testid="status-deployment-confirmed">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-emerald-100">Sepolia deployment confirmed</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{deploymentMessage || 'The contract has a confirmed transaction on Sepolia. This is not a mainnet deployment.'}</p>
              </div>
            </div>
            {txHash && (
              <a href={txUrl!} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2 text-xs text-primary hover:border-primary/40" data-testid="link-sepolia-transaction">
                <span className="shrink-0">Transaction</span><span className="min-w-0 truncate font-mono text-foreground/80">{shortAddress(txHash)}</span><ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0" />
              </a>
            )}
            {contractAddress && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/35 px-3 py-2">
                <span className="text-xs text-muted-foreground">Contract</span>
                <a href={contractUrl!} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all font-mono text-xs text-primary hover:underline" data-testid="link-sepolia-contract">{contractAddress}</a>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
            )}
            {contractAddress && (
              <Btn size="sm" onClick={onAddToMetaMask} data-testid="button-add-to-metamask">
                <Plus className="h-3.5 w-3.5" /> Add token to MetaMask
              </Btn>
            )}
          </div>
        )}
      </Card>

      {deployed && !contractAddress && (
        <p className="sr-only" data-testid="status-contract-address-pending">Deployment is confirmed; contract address has not been provided.</p>
      )}
      <p className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-muted-foreground" data-testid="text-deployment-scope">
        <Fuel className="mt-px h-3 w-3 shrink-0" />
        A successful testnet deployment does not establish investment value, legal compliance, an audit, or a security guarantee.
        {deployed && <Check className="ml-auto h-3 w-3 shrink-0 text-emerald-300" />}
      </p>
    </section>
  );
}

export default LaunchpadDeployPanel;
