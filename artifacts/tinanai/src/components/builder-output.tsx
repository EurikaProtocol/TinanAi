import { useMemo, useState } from 'react';
import { Download, FileCode2, FileJson2, FileText, Package, ShieldCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getDownloadTinanaiBuilderExportUrl,
  type TinanaiBuilderArtifact,
  type TinanaiBuilderResponse,
} from '@workspace/api-client-react';
import { zipSync } from 'fflate';
import { Btn, Card, Empty, Markdown } from '@/components/kit';
import { download, downloadBytes, slug, withCsp } from '@/lib/helpers';
import { getCurrentLocale, LocalizedTree } from '@/lib/i18n';

const CHART_COLOR = '#61A9BD';

function sizeLabel(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveLocalAsset(currentPath: string, source: string): string | null {
  const cleanSource = source.split(/[?#]/, 1)[0] ?? '';
  if (!cleanSource || /^(?:[a-z]+:|\/\/|#)/i.test(cleanSource)) return null;
  const parts = cleanSource.startsWith('/')
    ? []
    : currentPath.split('/').slice(0, -1);
  for (const part of cleanSource.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function appPreviewDocument(artifacts: TinanaiBuilderArtifact[]): string {
  const entry = artifacts.find((file) => file.path === 'index.html');
  if (!entry) return '';
  const byPath = new Map(artifacts.map((file) => [file.path, file.content]));
  let html = entry.content;
  html = html.replace(
    /<link\b([^>]*\bhref\s*=\s*["']([^"']+\.css(?:[?#][^"']*)?)["'][^>]*)>/gi,
    (tag, attributes: string, source: string) => {
      const assetPath = resolveLocalAsset(entry.path, source);
      const css = assetPath ? byPath.get(assetPath) : undefined;
      return css === undefined ? tag : `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    },
  );
  html = html.replace(
    /<script\b([^>]*\bsrc\s*=\s*["']([^"']+\.m?js(?:[?#][^"']*)?)["'][^>]*)>\s*<\/script>/gi,
    (tag, attributes: string, source: string) => {
      const assetPath = resolveLocalAsset(entry.path, source);
      const script = assetPath ? byPath.get(assetPath) : undefined;
      return script === undefined
        ? tag
        : `<script${attributes.replace(/\s+src\s*=\s*(["'])[^"']+\1/i, '')}>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
    },
  );
  return withCsp(html);
}

function artifactIcon(path: string) {
  if (path.endsWith('.json')) return <FileJson2 className="h-4 w-4" />;
  if (path.endsWith('.md')) return <FileText className="h-4 w-4" />;
  return <FileCode2 className="h-4 w-4" />;
}

export function BuilderOutput({ result }: { result: TinanaiBuilderResponse | null }) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [activePath, setActivePath] = useState('');
  const doc = useMemo(
    () => result?.outputType === 'app' ? appPreviewDocument(result.artifacts) : '',
    [result],
  );

  if (!result) {
    return (
      <LocalizedTree>
      <Card className="min-h-[420px] p-6">
        <Empty
          icon={<Package className="h-5 w-5" />}
          title="Your generated files appear here"
          desc="Choose an output type, add a prompt or files, and generate a result."
        />
      </Card>
      </LocalizedTree>
    );
  }

  const activeArtifact =
    result.artifacts.find((artifact) => artifact.path === activePath) ?? result.artifacts[0];
  const downloadArchive = () => {
    const entries = Object.fromEntries(
      result.artifacts.map((artifact) => [artifact.path, new TextEncoder().encode(artifact.content)]),
    );
    const archive = zipSync(entries, { level: 6 });
    downloadBytes(`${slug(result.outputType)}-output.zip`, archive, 'application/zip');
  };

  return (
    <LocalizedTree>
    <Card className="overflow-hidden p-0" data-testid="panel-builder-result">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 sm:p-4">
        <div className="flex gap-1" role="tablist" aria-label="Generated result views">
          {(['preview', 'code'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={tab === view}
              onClick={() => setTab(view)}
              data-testid={`tab-${view}`}
              className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${tab === view ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {view === 'preview' ? 'Preview' : 'Files'}
            </button>
          ))}
        </div>
        <Btn size="sm" onClick={downloadArchive} data-testid="button-download-zip">
          <Package className="h-4 w-4" /> Download ZIP
        </Btn>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{result.outputType} output</p>
          <div className="mt-2 text-sm leading-6 text-foreground/90" data-testid="text-generation-summary">
            <Markdown text={result.summary} />
          </div>
        </div>

        {result.uploads.length > 0 && (
          <details className="rounded-lg border border-border bg-background/50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-foreground/85">
              Inspected files ({result.uploads.length})
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px] text-muted-foreground" data-testid="list-inspected-files">
              {result.uploads.slice(0, 120).map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex flex-wrap justify-between gap-x-3">
                  <span className="break-all">{file.name} · {file.format}</span>
                  <span className="shrink-0">{sizeLabel(file.size)}{file.truncated ? ' · excerpt limited' : ''}</span>
                  {file.warning && <span className="w-full text-amber-200">{file.warning}</span>}
                </li>
              ))}
              {result.uploads.length > 120 && <li>Showing the first 120 entries.</li>}
            </ul>
          </details>
        )}

        {result.warnings.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100" data-testid="list-generation-warnings">
            {result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        )}

        {result.tokenCompilation && (
          <div
            className={`rounded-lg border p-3 text-sm ${result.tokenCompilation.compiled ? 'border-emerald-300/25 bg-emerald-300/[.06]' : 'border-amber-300/25 bg-amber-300/[.06]'}`}
            data-testid="status-token-compilation"
          >
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              {result.tokenCompilation.compiled ? 'Solidity compiled locally' : 'Compilation not verified'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.tokenCompilation.contractName} · solc {result.tokenCompilation.compilerVersion}. Compilation is not an audit or deployment.
            </p>
            {result.tokenCompilation.errors.map((error, index) => (
              <pre key={index} className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-amber-100">{error}</pre>
            ))}
          </div>
        )}

        {result.datasets.map((dataset, index) => (
          <section key={`${dataset.sourceName}-${dataset.sheetName ?? index}`} className="space-y-3 border-t border-border pt-4" data-testid={`panel-dataset-${index}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{dataset.sourceName}{dataset.sheetName ? ` · ${dataset.sheetName}` : ''}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dataset.rowCount.toLocaleString(getCurrentLocale())} rows analyzed · {dataset.columnCount} columns · {dataset.duplicateRows.toLocaleString(getCurrentLocale())} duplicate rows
                  {dataset.truncated ? ' · analysis limited to a sample' : ''}
                </p>
              </div>
              {dataset.cleanCsvUrl && (
                <a
                  href={getDownloadTinanaiBuilderExportUrl(dataset.cleanCsvUrl.split('/').pop() ?? '')}
                  data-testid={`link-download-clean-csv-${index}`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:border-primary/50 hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" /> Clean CSV ({sizeLabel(dataset.cleanCsvBytes)})
                </a>
              )}
            </div>

            {dataset.chart && dataset.chart.points.length > 0 && (
              <div className="rounded-xl border border-border bg-background/55 p-3 sm:p-4">
                <h4 data-no-translate className="mb-3 text-sm font-semibold">{dataset.chart.title}</h4>
                <div className="h-56 w-full" data-testid={`chart-dataset-${index}`}>
                  <ResponsiveContainer width="100%" height="100%" debounce={0}>
                    <BarChart data={dataset.chart.points}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a1a1aa' }} stroke="#71717a" />
                      <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} stroke="#71717a" />
                      <Tooltip
                        isAnimationActive={false}
                        cursor={false}
                        contentStyle={{ backgroundColor: '#fff', borderRadius: 6, border: '1px solid #e4e4e7', color: '#18181b', fontSize: 12 }}
                        labelStyle={{ color: '#27272a', fontWeight: 600 }}
                        formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : String(value), dataset.chart?.valueColumn ?? 'Value']}
                      />
                      <Bar dataKey="value" name={dataset.chart.valueColumn} fill={CHART_COLOR} fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {dataset.chart.aggregation === 'mean' ? `Mean ${dataset.chart.valueColumn} grouped by ${dataset.chart.categoryColumn}.` : dataset.chart.aggregation === 'count' ? `Actual row counts grouped by ${dataset.chart.categoryColumn}.` : `${dataset.chart.valueColumn} from the first rows.`}
                  {dataset.chart.sampled ? ' Chart displays a limited sample of categories or rows.' : ''}
                </p>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Column</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Type</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Missing</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Min</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Max</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.columns.map((column) => (
                    <tr key={column.name} className="border-t border-border">
                      <td data-no-translate className="max-w-48 truncate px-3 py-2 font-medium">{column.name}</td>
                      <td data-no-translate className="px-3 py-2 text-muted-foreground">{column.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{column.missing.toLocaleString(getCurrentLocale())}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{column.min?.toLocaleString(getCurrentLocale()) ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{column.max?.toLocaleString(getCurrentLocale()) ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{column.mean?.toLocaleString(getCurrentLocale(), { maximumFractionDigits: 3 }) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {dataset.previewRows.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Preview first {dataset.previewRows.length} rows</summary>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-secondary/50">
                      <tr>{dataset.columns.map((column) => <th data-no-translate key={column.name} className="max-w-52 whitespace-nowrap px-3 py-2 font-semibold">{column.name}</th>)}</tr>
                    </thead>
                    <tbody>
                      {dataset.previewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-border">
                          {dataset.columns.map((column) => (
                            <td data-no-translate key={column.name} className="max-w-52 truncate px-3 py-2 text-muted-foreground">
                              {row[column.name] === null || row[column.name] === undefined ? '—' : String(row[column.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
        ))}

        {result.artifacts.length > 0 && (
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Generated files</h3>
            <div className="flex flex-wrap gap-2">
              {result.artifacts.map((artifact) => (
                <button
                  type="button"
                  key={artifact.path}
                  onClick={() => { setActivePath(artifact.path); setTab('code'); }}
                  data-testid={`button-file-${artifact.path.replace(/[^a-z0-9]+/gi, '-')}`}
                  className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${activeArtifact?.path === artifact.path ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {artifactIcon(artifact.path)}
                  <span data-no-translate className="truncate">{artifact.path}</span>
                  <span className="text-[10px] opacity-65">{sizeLabel(new TextEncoder().encode(artifact.content).byteLength)}</span>
                </button>
              ))}
            </div>
            {tab === 'preview' && result.outputType === 'app' && doc ? (
              <iframe title="Generated app preview" sandbox="allow-scripts" srcDoc={doc} data-testid="iframe-preview" className="h-[500px] w-full rounded-xl border border-border bg-white" />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
                  {activeArtifact ? <span data-no-translate className="truncate">{activeArtifact.path}</span> : <span>No generated files</span>}
                  {activeArtifact && (
                    <Btn
                      size="sm"
                      onClick={() => download(activeArtifact.path.split('/').pop() ?? activeArtifact.path, activeArtifact.content, activeArtifact.mediaType)}
                      data-testid="button-download-file"
                    >
                      <Download className="h-3.5 w-3.5" /> Download file
                    </Btn>
                  )}
                </div>
                <pre className="max-h-[500px] min-h-40 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground/85" data-testid="text-generated-code">
                  {activeArtifact ? <code data-no-translate>{activeArtifact.content}</code> : 'No generated content.'}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
    </Card>
    </LocalizedTree>
  );
}
