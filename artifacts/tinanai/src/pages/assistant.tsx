import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Leaf, MessageSquarePlus, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { Btn, ErrorNote, Markdown, PageHeader, Textarea } from '@/components/kit';
import { cn, copyText, useAssist, useResearch } from '@/lib/helpers';
import { now, uid, useWorkspace, type Conversation, type Message } from '@/lib/store';
import { greenLeafCommandReply, parseGreenLeafCommand } from '@/lib/greenleaf';
import { useToast } from '@/hooks/use-toast';
import { LocalizedTree, useI18n } from '@/lib/i18n';

function formatResearchReply(
  answer: string,
  sources: { title: string; url: string }[],
  sourcesLabel: string,
  unverifiedNotice: string,
): string {
  if (sources.length === 0) return `${answer}\n\n> ${unverifiedNotice}`;
  const links = sources.map((source) => {
    const title = source.title
      .replace(/\s+/g, ' ')
      .replace(/[\\`*_{}\[\]()#+.!|>]/g, '\\$&')
      .slice(0, 240);
    return `- [${title}](<${source.url}>)`;
  });
  return `${answer}\n\n**${sourcesLabel}**\n${links.join('\n')}`;
}

export default function Assistant() {
  const { data, upsert, remove } = useWorkspace();
  const { toast } = useToast();
  const { t } = useI18n();
  const { ask, isPending: assistantPending, error, reset } = useAssist();
  const { research, isPending: researchPending, error: researchError, reset: resetResearch } = useResearch();
  const isPending = assistantPending || researchPending;
  const [id, setId] = useState<string>(() => data.conversations[0]?.id ?? uid());
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [lastFailed, setLastFailed] = useState<{ prompt: string; research: boolean } | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const convo = data.conversations.find((c) => c.id === id);
  const msgs = convo?.messages ?? [];
  const greenLeafActive = convo?.greenLeafMode === true;
  const visibleError = researchError ? t('Search is temporarily unavailable. Try again.') : error;
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, isPending]);

  const send = async (content: string, useWebResearch = researchMode) => {
    const query = content.trim();
    if (!query || isPending) return;
    const command = parseGreenLeafCommand(query);
    if (command) {
      const nextMode = command === 'on' ? true : command === 'off' ? false : greenLeafActive;
      const response: Message = { role: 'assistant', content: greenLeafCommandReply(command, nextMode) };
      const base: Conversation = convo ?? {
        id,
        title: 'Green Leaf conversation',
        messages: [],
        updatedAt: now(),
      };
      upsert('conversations', {
        ...base,
        greenLeafMode: nextMode,
        messages: [...base.messages, response],
        updatedAt: now(),
      });
      setText('');
      setLastFailed(null);
      toast({ title: command === 'on' ? 'Green Leaf Mode enabled' : command === 'off' ? 'Green Leaf Mode disabled' : 'Green Leaf Mode' });
      return;
    }
    if (useWebResearch) resetResearch();
    else reset();
    const history = msgs.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
    const withUser: Message[] = [...msgs, { role: 'user', content: query }];
    const base: Conversation = { id, title: convo?.title ?? query.slice(0, 48), messages: withUser, updatedAt: now(), greenLeafMode: greenLeafActive };
    upsert('conversations', base);
    setText(''); setLastFailed(null);
    try {
      let assistantContent: string;
      if (useWebResearch) {
        const result = await research(query);
        assistantContent = formatResearchReply(
          result.answer,
          result.sources,
          t('Sources'),
          t('No source links were returned. Treat this answer as unverified.'),
        );
      } else {
        assistantContent = await ask({ mode: 'chat', prompt: query, history, greenLeafMode: greenLeafActive });
      }
      upsert('conversations', { ...base, messages: [...withUser, { role: 'assistant', content: assistantContent }], updatedAt: now() });
    } catch { setLastFailed({ prompt: query, research: useWebResearch }); }
  };
  const newChat = () => { setId(uid()); reset(); resetResearch(); setLastFailed(null); };
  const clear = () => { if (convo) upsert('conversations', { ...convo, messages: [], updatedAt: now() }); reset(); resetResearch(); setLastFailed(null); toast({ title: 'Conversation reset' }); };
  const copy = async (c: string, i: number) => { if (await copyText(c)) { setCopied(i); setTimeout(() => setCopied(null), 1500); } };

  return (
    <LocalizedTree>
    <div>
      <PageHeader eyebrow="Assistant" title="Think out loud" desc="Live conversation. Your messages go to the TINANAI assistant; history and Green Leaf settings are saved only in this browser."
        action={<div className="flex gap-2"><Btn onClick={newChat} data-testid="button-new-chat"><MessageSquarePlus className="h-4 w-4" />New</Btn>
          <Btn onClick={clear} disabled={!msgs.length} data-testid="button-reset-chat"><RotateCcw className="h-4 w-4" />Reset</Btn></div>} />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="order-2 space-y-1.5 lg:order-1" data-testid="list-conversations">
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">History</p>
          {data.conversations.length === 0 && <p className="text-xs text-muted-foreground">Saved conversations will appear here.</p>}
          {[...data.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((c) => (
            <div key={c.id} className={cn('group flex items-center rounded-md border text-sm', c.id === id ? 'border-primary/50 bg-primary/10' : 'border-border hover:border-primary/30')}>
              <button data-no-translate onClick={() => { setId(c.id); reset(); resetResearch(); setLastFailed(null); }} data-testid={`button-open-chat-${c.id}`} className="min-w-0 flex-1 truncate px-3 py-2 text-left">{c.title}</button>
              <button onClick={() => { remove('conversations', c.id); if (c.id === id) newChat(); }} aria-label="Delete conversation" data-testid={`button-delete-chat-${c.id}`} className="px-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </aside>
        <section className="order-1 flex min-h-[60dvh] flex-col rounded-xl border border-card-border bg-card/70 lg:order-2">
          {greenLeafActive && <div role="status" aria-label="Green Leaf Mode is active for this conversation" data-testid="indicator-greenleaf" className="flex items-center gap-2 border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-100">
            <Leaf className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-semibold">Green Leaf Mode</span>
            <span className="hidden text-emerald-100/70 sm:inline">· Independent thinking, clear uncertainty, practical exploration</span>
          </div>}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" data-testid="list-messages">
            {msgs.length === 0 && !isPending && (
              <div className="py-10 text-center">
                <p className="font-serif text-3xl gold-text">Begin.</p>
                <p className="mt-1 text-sm text-muted-foreground">Try one of these starting points.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['Outline a launch plan for a digital product', 'Help me name and position a creator tool', 'What should I document before tokenizing an asset?'].map((s, i) => (
                    <button key={s} onClick={() => send(s)} data-testid={`button-suggest-${i}`} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex animate-in fade-in slide-in-from-bottom-1', m.role === 'user' ? 'justify-end' : 'justify-start')} data-testid={`message-${m.role}-${i}`}>
                <div className={cn('max-w-[88%] rounded-xl px-4 py-3 text-sm', m.role === 'user' ? 'border border-primary/30 bg-primary/10 whitespace-pre-wrap' : 'border border-border bg-background/60')}>
                  {m.role === 'user' ? <span data-no-translate>{m.content}</span> : <><Markdown text={m.content} />
                    <button onClick={() => copy(m.content, i)} data-testid={`button-copy-${i}`} className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">{copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied === i ? 'Copied' : 'Copy'}</button></>}
                </div>
              </div>
            ))}
            {isPending && <div className="dots flex gap-1 px-2 text-2xl text-primary" data-testid="status-thinking"><span>.</span><span>.</span><span>.</span></div>}
            {visibleError && <ErrorNote message={visibleError} onRetry={lastFailed ? () => send(lastFailed.prompt, lastFailed.research) : undefined} />}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="space-y-2 border-t border-border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Textarea rows={2} maxLength={researchMode ? 3000 : 12000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message TINANAI" data-testid="input-message" disabled={isPending}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} className="min-w-0 flex-1 resize-none" />
              <Btn type="button" variant={researchMode ? 'gold' : 'outline'} aria-pressed={researchMode}
                onClick={() => { setResearchMode((value) => !value); resetResearch(); }}
                disabled={isPending} data-testid="button-toggle-web-research">
                <Search className="h-4 w-4" />Search the web
              </Btn>
              <Btn variant="gold" type="submit" disabled={isPending || !text.trim()} data-testid="button-send" aria-label="Send"><Send className="h-4 w-4" /></Btn>
            </div>
            {researchMode && <p className="px-1 text-[11px] text-muted-foreground">Search uses live results. Check source links before relying on an answer.</p>}
          </form>
        </section>
      </div>
    </div>
    </LocalizedTree>
  );
}
