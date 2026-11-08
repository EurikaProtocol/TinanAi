import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAssistTinanai, useResearchTinanai } from '@workspace/api-client-react';
import { getCurrentLocale, useI18n } from '@/lib/i18n';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export function errMsg(e: unknown): string {
  const x = e as { data?: { error?: string }; message?: string } | null;
  return x?.data?.error || x?.message || 'The assistant could not respond. Try again.';
}
export function stripFences(s: string): string {
  const m = s.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
export function withCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${meta}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (openHtml) => `${openHtml}<head>${meta}</head>`);
  }
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}
export function download(name: string, content: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadBytes(name: string, bytes: Uint8Array, mime = 'application/octet-stream') {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tinanai';
export const fmtDate = (s: string, locale = getCurrentLocale()) => new Date(s).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtMoney = (n: number, locale = getCurrentLocale()) => n.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export async function copyText(s: string) {
  try { await navigator.clipboard.writeText(s); return true; } catch { return false; }
}

type Mode = 'chat' | 'document' | 'builder' | 'tokenization';
export function useAssist() {
  const m = useAssistTinanai();
  const { locale } = useI18n();
  const ask = async (p: { mode: Mode; prompt: string; documentText?: string; history?: { role: 'user' | 'assistant'; content: string }[]; greenLeafMode?: boolean }) => {
    const res = await m.mutateAsync({ data: { ...p, language: locale, prompt: p.prompt.slice(0, 12000), history: p.history?.slice(-12).map((turn) => ({ ...turn, content: turn.content.slice(0, 12000) })) } });
    return res.reply;
  };
  return { ask, isPending: m.isPending, error: m.error ? errMsg(m.error) : null, reset: m.reset };
}

export function useResearch() {
  const mutation = useResearchTinanai();
  const { locale } = useI18n();
  const research = async (query: string) => mutation.mutateAsync({
    data: { query, language: locale },
  });
  return {
    research,
    isPending: mutation.isPending,
    error: mutation.error ? errMsg(mutation.error) : null,
    reset: mutation.reset,
  };
}
