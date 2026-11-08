import { useRef, useState } from 'react';
import { Copy, Download, FileText, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { Btn, Card, Empty, ErrorNote, Field, Input, Markdown, PageHeader, Select, Skeleton, Textarea } from '@/components/kit';
import { copyText, download, fmtDate, slug, useAssist } from '@/lib/helpers';
import { now, uid, useWorkspace } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { LocalizedTree } from '@/lib/i18n';
import { Link } from 'wouter';

const GOALS: Record<string, string> = {
  'Executive summary': 'Write a concise executive summary with the key points.',
  'Risks and gaps': 'Identify risks, gaps, ambiguities and missing information.',
  'Extract key data': 'Extract the key facts, figures, names and dates as a structured list.',
  'Action items': 'List concrete next actions with suggested owners and priority.',
  'Investor brief': 'Turn this into a short investor-ready brief: problem, solution, traction signals, open questions.',
};

export default function Documents() {
  const { data, upsert, remove } = useWorkspace();
  const { toast } = useToast();
  const { ask, isPending, error } = useAssist();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [goal, setGoal] = useState('Executive summary');
  const [result, setResult] = useState('');
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const onFile = async (f?: File) => {
    if (!f) return;
    if (!/\.(txt|md|csv)$/i.test(f.name)) { toast({ title: 'Unsupported file', description: 'Use TXT, MD or CSV.', variant: 'destructive' }); return; }
    setText(await f.text()); setFileName(f.name); setName(f.name.replace(/\.[^.]+$/, ''));
  };
  const run = async () => {
    if (!text.trim()) return;
    setResult('');
    try {
      const r = await ask({ mode: 'document', prompt: `${GOALS[goal]} (Goal: ${goal})`, documentText: text.slice(0, 20000) });
      setResult(r);
    } catch { /* shown via error */ }
  };
  const save = () => {
    upsert('analyses', { id: uid(), name: name.trim() || `${goal} analysis`, goal, result, createdAt: now() });
    toast({ title: 'Analysis saved' });
  };
  const exportMd = (n: string, g: string, r: string) => download(`${slug(n)}.md`, `# ${n}\n\nGoal: ${g}\n\n${r}\n`, 'text/markdown');

  return (
    <LocalizedTree>
    <div>
      <PageHeader
        eyebrow="Documents"
        title="Read between the lines"
        desc="Upload TXT, MD or CSV, or paste text. Only the text you submit is sent to the assistant."
        action={<Link href="/tokenize?mode=proof" data-testid="link-document-proof" className="inline-flex min-h-10 items-center rounded-lg border border-primary/40 bg-primary/10 px-4 text-xs font-semibold text-primary transition hover:bg-primary/15">Verify a document proof</Link>}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={file} type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" hidden data-testid="input-file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Btn onClick={() => file.current?.click()} data-testid="button-upload"><Upload className="h-4 w-4" />Upload file</Btn>
            {fileName && <span className="text-xs text-primary" data-testid="text-filename">{fileName}</span>}
            {text && <Btn variant="ghost" size="sm" onClick={() => { setText(''); setFileName(''); setResult(''); }} data-testid="button-clear-doc">Clear</Btn>}
          </div>
          <Field label="Document text" hint={`${text.length.toLocaleString()} / 20,000 characters${text.length > 20000 ? ' - extra text will be trimmed' : ''}`}>
            <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste document text here" data-testid="input-document" className="font-mono text-xs" />
          </Field>
          <Field label="Analysis goal">
            <Select value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="select-goal">{Object.keys(GOALS).map((g) => <option key={g}>{g}</option>)}</Select>
          </Field>
          <Btn variant="gold" className="w-full" onClick={run} disabled={isPending || !text.trim()} data-testid="button-analyze"><Sparkles className="h-4 w-4" />{isPending ? 'Analyzing' : 'Analyze document'}</Btn>
        </Card>
        <Card className="min-h-[300px]" data-testid="panel-result">
          {isPending ? <Skeleton lines={7} /> : error ? <ErrorNote message={error} onRetry={run} /> : result ? (
            <div className="space-y-4">
              <Markdown text={result} />
              <div className="space-y-3 border-t border-border pt-4">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this analysis" data-testid="input-analysis-name" />
                <div className="flex flex-wrap gap-2">
                  <Btn variant="gold" onClick={save} data-testid="button-save-analysis"><Save className="h-4 w-4" />Save</Btn>
                  <Btn onClick={() => exportMd(name || 'analysis', goal, result)} data-testid="button-export-analysis"><Download className="h-4 w-4" />Export .md</Btn>
                  <Btn onClick={async () => toast({ title: (await copyText(result)) ? 'Copied' : 'Copy failed' })} data-testid="button-copy-analysis"><Copy className="h-4 w-4" />Copy</Btn>
                </div>
              </div>
            </div>
          ) : <Empty icon={<FileText className="h-5 w-5" />} title="Result appears here" desc="Add a document, pick a goal and run the analysis." />}
        </Card>
      </div>
      <h2 className="mb-4 mt-12 font-serif text-3xl">Saved analyses</h2>
      {data.analyses.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-no-analyses">Nothing saved yet.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.analyses.map((a) => (
            <Card key={a.id} data-testid={`card-analysis-${a.id}`}>
              <p className="font-semibold">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.goal} - {fmtDate(a.createdAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn size="sm" onClick={() => { setResult(a.result); setGoal(a.goal in GOALS ? a.goal : goal); setName(a.name); window.scrollTo({ top: 0, behavior: 'smooth' }); }} data-testid={`button-view-analysis-${a.id}`}>View</Btn>
                <Btn size="sm" onClick={() => exportMd(a.name, a.goal, a.result)} data-testid={`button-export-saved-${a.id}`}>Export</Btn>
                <Btn size="sm" variant="danger" onClick={() => remove('analyses', a.id)} data-testid={`button-delete-analysis-${a.id}`} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
    </LocalizedTree>
  );
}
