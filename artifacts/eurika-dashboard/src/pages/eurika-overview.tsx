import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getGetEurikaOverviewQueryKey, useGetEurikaOverview, type EurikaOverview, type EurikaRawLog, type EurikaTransaction } from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  Fingerprint,
  Moon,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";

const REFRESH_OPTIONS = [
  { label: "Every 5 minutes", value: 5 * 60 * 1000 },
  { label: "Every 15 minutes", value: 15 * 60 * 1000 },
  { label: "Every hour", value: 60 * 60 * 1000 },
  { label: "Every 24 hours", value: 24 * 60 * 60 * 1000 },
];

const CHART_COLORS = { amber: "#c87932", teal: "#4c8c8a" };

function shortAddress(value: string | null | undefined, start = 10, end = 8) {
  if (!value) return "Unavailable";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatDate(value: string | null | undefined, fallback = "Timestamp unavailable") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatWei(value: string) {
  try {
    const wei = BigInt(value);
    const ether = wei / 10n ** 18n;
    const fractional = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
    return `${ether.toString()}${fractional ? `.${fractional}` : ""} ETH`;
  } catch {
    return `${value} wei`;
  }
}

function StatusPill({ children, tone = "neutral" }: { children: string; tone?: "good" | "warn" | "neutral" | "bad" }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>;
}

function SectionHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
      </div>
      {aside && <span className="mono text-[11px] tracking-wide text-muted-foreground">{aside}</span>}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-[100dvh] bg-background px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1480px] animate-pulse">
        <div className="mb-8 h-9 w-64 rounded bg-muted" />
        <div className="mb-6 h-48 rounded-xl bg-muted" />
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-xl bg-muted" />)}
        </div>
        <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <div className="h-80 rounded-xl bg-muted" /><div className="h-80 rounded-xl bg-muted" />
        </div>
        <div className="h-96 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-panel">
      <Database className="mb-3 h-5 w-5 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActivityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <p className="mb-1 text-muted-foreground">{label}</p>
      <p className="mono font-medium text-foreground">{payload[0].value} transactions</p>
    </div>
  );
}

function DataView({
  overview,
  isFetching,
  refetch,
  dataUpdatedAt,
  autoRefresh,
  setAutoRefresh,
  intervalMs,
  setIntervalMs,
}: {
  overview: EurikaOverview;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
  dataUpdatedAt: number;
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean | ((current: boolean) => boolean)) => void;
  intervalMs: number;
  setIntervalMs: (value: number) => void;
}) {
  const [dark, setDark] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  useEffect(() => {
    function dismissOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", dismissOutside);
    return () => document.removeEventListener("mousedown", dismissOutside);
  }, []);

  const activity = useMemo(() => overview.activityByDay.map((point) => ({
    ...point,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  })), [overview.activityByDay]);
  const totalObserved = activity.reduce((sum, point) => sum + point.transactionCount, 0);
  const lastRefreshLabel = dataUpdatedAt ? formatDate(new Date(dataUpdatedAt).toISOString()) : "Not reported";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(overview.contractAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const addressUrl = `https://etherscan.io/address/${overview.contractAddress}`;

  return (
    <main className="grain min-h-[100dvh] bg-background text-foreground transition-colors">
      <div className="mx-auto max-w-[1480px] px-4 pb-14 pt-5 md:px-8 md:pt-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="brand-mark mt-1"><span>e</span></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow mb-0">EURIKA PROTOCOL / EVIDENCE VIEW</p>
                <span className="hidden h-px w-8 bg-border sm:block" />
                <span className="mono text-[10px] tracking-[.16em] text-muted-foreground">MAINNET INDEX</span>
              </div>
              <h1 className="display mt-2 text-3xl font-extrabold tracking-[-.045em] md:text-[40px]">Contract overview</h1>
              <p className="mt-1 text-sm text-muted-foreground">Explorer facts, clearly separated from unverified protocol claims.</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 pt-1 sm:w-auto">
            <div className="relative" ref={dropdownRef}>
              <div className="split-control">
                <button className="split-main" type="button" onClick={() => void refetch()} disabled={isFetching} data-testid="button-refresh">
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <span className="split-divider" />
                <button className="split-toggle" type="button" onClick={() => setDropdownOpen((open) => !open)} aria-label="Refresh settings" aria-expanded={dropdownOpen} data-testid="button-refresh-settings">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              {dropdownOpen && (
                <div className="refresh-menu">
                  <div className="flex items-center justify-between gap-5 border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Auto-refresh</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Off by default · minimum 5 min</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoRefresh}
                      aria-label="Toggle automatic refresh"
                      onClick={() => setAutoRefresh((enabled) => !enabled)}
                      className={`switch ${autoRefresh ? "switch-on" : ""}`}
                      data-testid="switch-auto-refresh"
                    ><span /></button>
                  </div>
                  <div className="px-4 pb-2 pt-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Interval</p>
                    {REFRESH_OPTIONS.map((option) => (
                      <button type="button" key={option.value} className="interval-option" onClick={() => { setIntervalMs(option.value); setAutoRefresh(true); }}>
                        {option.label}{intervalMs === option.value && autoRefresh ? <Check className="h-3.5 w-3.5 text-primary" /> : <span />}
                      </button>
                    ))}
                  </div>
                  <p className="px-4 pb-3 text-[11px] text-muted-foreground">Manual refresh remains available at any time.</p>
                </div>
              )}
            </div>
            <button type="button" onClick={() => window.print()} className="icon-control" aria-label="Export PDF" title="Export PDF" data-testid="button-export-pdf"><Printer className="h-4 w-4" /></button>
            <button type="button" onClick={() => setDark((value) => !value)} className="icon-control" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title="Toggle theme" data-testid="button-theme-toggle">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-border py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusPill tone={overview.integrationHealth === "operational" ? "good" : overview.integrationHealth === "limited" ? "warn" : "bad"}>
              {`Data layer ${overview.integrationHealth}`}
            </StatusPill>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Checked {lastRefreshLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5d9a76]" />
            Sources reported below
          </div>
        </div>

        <section className="contract-hero print-card">
          <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
          <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,.7fr)]">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusPill tone={overview.codeStatus === "deployed" ? "good" : overview.codeStatus === "unavailable" ? "warn" : "bad"}>
                  {`Code ${overview.codeStatus.replaceAll("_", " ")}`}
                </StatusPill>
                <span className="hero-chain"><span className="eth-diamond" />{overview.chainName} <span className="hero-chain-id">CHAIN {overview.chainId}</span></span>
              </div>
              <p className="eyebrow hero-eyebrow">SUPPLIED CONTRACT ADDRESS</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="mono break-all text-[15px] leading-relaxed text-[#f4eadc] md:text-[17px]" data-testid="text-contract-address">{overview.contractAddress}</code>
                <button type="button" className="hero-copy" onClick={() => void copyAddress()} aria-label="Copy contract address" data-testid="button-copy-address">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <a className="hero-copy" href={addressUrl} target="_blank" rel="noreferrer" aria-label="View contract on Etherscan" data-testid="link-explorer-address"><ExternalLink className="h-4 w-4" /></a>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#c2c6c5]">
                A read-only view of public explorer records. This page does not establish source code identity or protocol behavior.
              </p>
            </div>
            <div className="hero-state">
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow hero-eyebrow">SOURCE VERIFICATION</span>
                {overview.verificationStatus === "verified"
                  ? <ShieldCheck className="h-5 w-5 text-[#8cb69a]" />
                  : <ShieldAlert className="h-5 w-5 text-[#e8ae71]" />}
              </div>
              <p className="mt-3 font-semibold capitalize text-[#f4eadc]">{overview.verificationStatus}</p>
              <p className="mt-1 text-xs leading-5 text-[#b7bdbb]">
                {overview.verificationStatus === "verified"
                  ? "Explorer reports verified source. This is explorer-reported evidence, not an independent code audit."
                  : "Source and ABI are not verified in the available data. No source-derived behavior is asserted."}
              </p>
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between text-xs"><span className="text-[#9ea8a8]">Owner</span><span className="mono text-[#e8ded1]">{overview.ownerAddress ? shortAddress(overview.ownerAddress) : "Unknown / unavailable"}</span></div>
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-[#9ea8a8]">Admin</span><span className="mono text-[#e8ded1]">{overview.adminAddress ? shortAddress(overview.adminAddress) : "Unknown / unavailable"}</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Activity summary">
          <MetricCard label="Transactions in series" value={totalObserved.toLocaleString()} note={`${overview.activityByDay.length} reported day${overview.activityByDay.length === 1 ? "" : "s"}`} icon={<Activity className="h-4 w-4" />} />
          <MetricCard label="Recent transactions" value={overview.recentTransactions.length.toString()} note="Explorer response · max 20" icon={<ArrowUpRight className="h-4 w-4" />} />
          <MetricCard label="Raw logs returned" value={overview.recentLogs.length.toString()} note="Explorer response · max 20" icon={<Database className="h-4 w-4" />} />
          <MetricCard label="ABI functions" value={overview.functionsStatus === "available" ? overview.supportedFunctions.filter((entry) => entry.kind === "function").length.toString() : "—"} note={overview.functionsStatus === "available" ? "Reported ABI entries" : "Unavailable · ABI unverified"} icon={<FileCode2 className="h-4 w-4" />} />
        </section>

        <section className="mt-9">
          <SectionHeading eyebrow="01 / CONTRACT RECORD" title="What the explorers report" aside="PUBLIC METADATA ≠ VERIFIED SOURCE" />
          <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
            <div className="surface-card print-card">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <h3 className="card-heading">Deployment & classification</h3>
                <Fingerprint className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="detail-grid">
                <Detail label="Network" value={`${overview.chainName} · chain ${overview.chainId}`} />
                <Detail label="Bytecode status" value={overview.codeStatus.replaceAll("_", " ")} tag={overview.codeStatus === "deployed" ? "good" : "neutral"} />
                <Detail label="Proxy status" value={overview.proxyStatus ?? "Unknown / unavailable"} />
                <div className="detail-row">
                  <span className="detail-label">Contract classification</span>
                  <div className="text-right">
                    <span className="text-sm font-medium">{overview.contractType ?? "Unavailable"}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {overview.contractTypeSource === "verified_source" ? "Based on verified source" : overview.contractTypeSource === "explorer_metadata" ? "Explorer metadata only · not source-verified" : "Evidence unavailable"}
                    </span>
                  </div>
                </div>
                <Detail label="Read capability" value={overview.readCapability.replaceAll("_", " ")} />
              </div>
              <div className="mt-4 flex gap-2 rounded-lg border border-[#ddc59f] bg-[#f8f0e2] p-3 text-xs leading-5 text-[#66553e] dark:border-[#64533e] dark:bg-[#30291f] dark:text-[#ddc9a9]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Classification, token metadata, and transaction methods can be explorer-derived. They are not evidence of verified source code or protocol semantics.
              </div>
            </div>
            <div className="surface-card print-card">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <h3 className="card-heading">Token metadata</h3>
                <span className="source-chip">{overview.tokenMetadata.source.replaceAll("_", " ")}</span>
              </div>
              <div className="detail-grid">
                <Detail label="Name" value={overview.tokenMetadata.name ?? "Unavailable"} />
                <Detail label="Symbol" value={overview.tokenMetadata.symbol ?? "Unavailable"} />
                <Detail label="Decimals" value={overview.tokenMetadata.decimals?.toString() ?? "Unavailable"} />
                <Detail label="Holder count" value={overview.tokenMetadata.holderCount?.toLocaleString() ?? "Unavailable"} />
                <Detail label="Classification" value={overview.tokenMetadata.classification ?? "Unavailable"} />
                <Detail label="Total supply (raw)" value={overview.tokenMetadata.totalSupplyRaw ?? "Unavailable"} mono />
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                Metadata is displayed as returned by the explorer source. Values have not been validated against contract code.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading eyebrow="02 / SOURCE & CAPABILITY" title="Evidence boundary" />
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="surface-card print-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="card-heading">Data-source health</h3>
                <span className="mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">AS REPORTED</span>
              </div>
              {overview.sources.length ? (
                <div className="space-y-2">
                  {overview.sources.map((source, index) => (
                    <div key={`${source.name}-${index}`} className="source-row" data-testid={`source-status-${index}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`source-led ${source.status === "available" ? "led-good" : "led-off"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{source.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.detail}</p>
                        </div>
                      </div>
                      <StatusPill tone={source.status === "available" ? "good" : "warn"}>{source.status}</StatusPill>
                    </div>
                  ))}
                </div>
              ) : <EmptyPanel title="No source status returned" detail="The service did not provide availability details for external sources." />}
            </div>
            <div className="surface-card print-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="card-heading">Read-only limits</h3>
                <ShieldAlert className="h-4 w-4 text-primary" />
              </div>
              <div className="capability-item">
                <span className="capability-index">01</span>
                <div><p className="text-sm font-semibold">Explorer data only</p><p className="mt-0.5 text-xs text-muted-foreground">No verified contract reads are exposed unless explicitly available from the source data.</p></div>
                <StatusPill tone="warn">{overview.readCapability.replaceAll("_", " ")}</StatusPill>
              </div>
              <div className="capability-item">
                <span className="capability-index">02</span>
                <div><p className="text-sm font-semibold">Functions unavailable</p><p className="mt-0.5 text-xs text-muted-foreground">ABI is unverified; no methods or events are inferred or synthesized.</p></div>
                <StatusPill tone="neutral">{overview.functionsStatus}</StatusPill>
              </div>
              <div className="capability-item">
                <span className="capability-index">03</span>
                <div><p className="text-sm font-semibold">Writes disabled</p><p className="mt-0.5 text-xs text-muted-foreground">No wallet, transaction composer, or on-chain write action is present.</p></div>
                <StatusPill tone="bad">{overview.writeCapability}</StatusPill>
              </div>
              {overview.functionsStatus === "available" && overview.supportedFunctions.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reported ABI entries</p>
                  <div className="space-y-2">{overview.supportedFunctions.map((entry, index) => <div key={`${entry.signature}-${index}`} className="mono rounded-md bg-muted/70 px-3 py-2 text-xs">{entry.kind} · {entry.signature}</div>)}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-9">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,.65fr)]">
            <div className="surface-card print-card">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">03 / PUBLIC ACTIVITY</p>
                  <h2 className="card-heading mt-1">Transactions by day</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Daily counts included in the overview response.</p>
                </div>
                {activity.length > 0 && <CSVLink className="export-button print:hidden" data={activity.map(({ date, transactionCount }) => ({ date, transactionCount }))} filename="eurika-transactions-by-day.csv" data-testid="button-export-activity-csv"><Download className="h-3.5 w-3.5" />CSV</CSVLink>}
              </div>
              {activity.length ? (
                <div className="mt-4 h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%" debounce={0}>
                    <AreaChart data={activity} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <defs><linearGradient id="eurikaActivityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.amber} stopOpacity={0.28} /><stop offset="100%" stopColor={CHART_COLORS.amber} stopOpacity={0.015} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 5" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ActivityTooltip />} isAnimationActive={false} cursor={{ fill: "rgba(200,121,50,.08)", stroke: "none" }} />
                      <Area type="monotone" dataKey="transactionCount" name="Transactions" stroke={CHART_COLORS.amber} strokeWidth={2} fill="url(#eurikaActivityFill)" isAnimationActive={false} activeDot={{ r: 4, fill: CHART_COLORS.amber, stroke: "hsl(var(--card))", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyPanel title="No activity series" detail="No day-by-day transaction counts were returned for this contract." />}
            </div>
            <div className="surface-card print-card">
              <p className="eyebrow">OBSERVATION WINDOW</p>
              <h2 className="card-heading mt-1">Response scope</h2>
              <div className="scope-count"><span>{overview.recentTransactions.length.toString().padStart(2, "0")}</span><p>recent public<br />transactions</p></div>
              <div className="scope-count"><span>{overview.recentLogs.length.toString().padStart(2, "0")}</span><p>raw log records<br />returned</p></div>
              <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                Lists are bounded by the API response (up to 20 each). Counts here describe returned records, not lifetime contract totals.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading eyebrow="04 / EXPLORER RECORDS" title="Recent transactions" aside="UP TO 20 PUBLIC RECORDS" />
          <div className="surface-card overflow-hidden p-0 print-card">
            {overview.recentTransactions.length ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[850px]">
                  <thead><tr><th>Transaction</th><th>Block / time</th><th>From → To</th><th>Explorer method</th><th>Value</th><th>Status</th></tr></thead>
                  <tbody>
                    {overview.recentTransactions.map((tx, index) => <TransactionRow key={`${tx.hash}-${index}`} transaction={tx} index={index} />)}
                  </tbody>
                </table>
              </div>
            ) : <EmptyPanel title="No transactions returned" detail="The overview response contains no recent transaction records." />}
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading eyebrow="05 / RAW RECEIPT DATA" title="Recent logs" aside="TOPICS SHOWN VERBATIM" />
          {overview.recentLogs.length ? (
            <div className="space-y-2">
              {overview.recentLogs.map((log, index) => <LogRecord key={`${log.transactionHash}-${index}`} log={log} index={index} />)}
            </div>
          ) : <div className="surface-card"><EmptyPanel title="No raw logs returned" detail="The overview response contains no recent log records." /></div>}
        </section>

        <footer className="mt-12 flex flex-col gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>EURIKA evidence view · read only · explorer-derived data may be incomplete.</p>
          <p className="mono">CHECKED {formatDate(overview.checkedAt)}</p>
        </footer>
      </div>
    </main>
  );

  function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
    return (
      <div className="metric-card print-card">
        <div className="flex items-center justify-between">
          <p className="eyebrow">{label}</p><span className="metric-icon">{icon}</span>
        </div>
        <p className="display mt-3 text-[32px] font-bold tracking-[-.04em] text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>
    );
  }

  function Detail({ label, value, mono = false, tag }: { label: string; value: string; mono?: boolean; tag?: "good" | "neutral" }) {
    return (
      <div className="detail-row">
        <span className="detail-label">{label}</span>
        <span className={`text-right text-sm ${mono ? "mono break-all text-xs" : "font-medium"} ${tag === "good" ? "capitalize text-[#4d8060] dark:text-[#9cc8a8]" : "capitalize"}`}>{value}</span>
      </div>
    );
  }
}

function TransactionRow({ transaction, index }: { transaction: EurikaTransaction; index: number }) {
  const explorerUrl = `https://etherscan.io/tx/${transaction.hash}`;
  return (
    <tr data-testid={`row-transaction-${index}`}>
      <td>
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mono text-[12px] text-[#9a5b25] hover:underline dark:text-[#e5aa6d]" data-testid={`link-transaction-${index}`}>
          {shortAddress(transaction.hash, 9, 7)}<ExternalLink className="h-3 w-3" />
        </a>
      </td>
      <td><span className="mono text-xs">{transaction.blockNumber?.toLocaleString() ?? "—"}</span><span className="mt-1 block text-[11px] text-muted-foreground">{formatDate(transaction.timestamp)}</span></td>
      <td><span className="mono text-xs">{shortAddress(transaction.fromAddress, 7, 5)}</span><span className="mx-1 text-muted-foreground">→</span><span className="mono text-xs">{shortAddress(transaction.toAddress, 7, 5)}</span></td>
      <td><span className="method-chip">{transaction.method ?? "Method unavailable"}</span></td>
      <td className="mono whitespace-nowrap text-xs">{formatWei(transaction.valueWei)}</td>
      <td><span className="text-xs capitalize">{transaction.status}</span></td>
    </tr>
  );
}

function LogRecord({ log, index }: { log: EurikaRawLog; index: number }) {
  return (
    <details className="log-card print-card" data-testid={`log-record-${index}`}>
      <summary className="log-summary">
        <span className="log-index mono">LOG {String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="mono block truncate text-xs">{shortAddress(log.transactionHash, 11, 8)}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">Block {log.blockNumber?.toLocaleString() ?? "unavailable"} · {formatDate(log.timestamp)}</span>
        </span>
        <span className="topic-count">{log.topics.length} topic{log.topics.length === 1 ? "" : "s"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
      </summary>
      <div className="log-body">
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Topics · raw hex</p>
          {log.topics.length ? <div className="space-y-2">{log.topics.map((topic, topicIndex) => (
            <div key={`${topicIndex}-${topic}`} className="topic-row"><span className="topic-label">topic{topicIndex}</span><code className="mono break-all text-xs">{topic}</code></div>
          ))}</div> : <p className="text-xs text-muted-foreground">No topics returned.</p>}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Data · raw hex</p>
          <code className="mono block break-all rounded-md bg-muted/70 p-3 text-xs leading-5">{log.data || "Empty data field"}</code>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><AlertCircle className="h-3 w-3" />No event names or parameter decoding inferred.</p>
      </div>
    </details>
  );
}

function DashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalMs, setIntervalMs] = useState(5 * 60 * 1000);
  const query = useGetEurikaOverview({
    query: {
      queryKey: getGetEurikaOverviewQueryKey(),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchInterval: autoRefresh ? intervalMs : false,
    },
  });
  const { data, error, isLoading, isFetching, refetch, dataUpdatedAt } = query;

  if (isLoading || (isFetching && !data)) return <LoadingShell />;
  if (error && !data) {
    return (
      <main className="min-h-[100dvh] bg-background px-5 py-12 text-foreground">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
          <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#f8e9e4] text-[#a74738] dark:bg-[#422924] dark:text-[#e49a88]"><X className="h-5 w-5" /></span>
          <p className="eyebrow">OVERVIEW UNAVAILABLE</p>
          <h1 className="display mt-2 text-2xl font-bold">Could not load explorer evidence</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{error instanceof Error ? error.message : "The overview request failed. No fallback or synthetic contract data is shown."}</p>
          <button type="button" className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => void refetch()} data-testid="button-retry"><RefreshCw className="h-4 w-4" />Retry request</button>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="min-h-[100dvh] bg-background p-8"><div className="mx-auto max-w-xl"><EmptyPanel title="No overview payload" detail="The API returned no contract overview. Refresh to retry." /><button type="button" onClick={() => void refetch()} className="mx-auto mt-4 flex items-center gap-2 text-sm text-primary" data-testid="button-retry-empty"><RefreshCw className="h-4 w-4" />Retry</button></div></main>;
  }
  return (
    <DataView
      overview={data}
      isFetching={isFetching}
      refetch={refetch}
      dataUpdatedAt={dataUpdatedAt}
      autoRefresh={autoRefresh}
      setAutoRefresh={setAutoRefresh}
      intervalMs={intervalMs}
      setIntervalMs={setIntervalMs}
    />
  );
}

export default DashboardPage;
