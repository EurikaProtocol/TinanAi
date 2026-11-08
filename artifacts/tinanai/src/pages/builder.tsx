import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { LocalizedTree, translateTemplate, useI18n } from '@/lib/i18n';
import {
  AlertTriangle, CloudUpload, Code2, Copy, Download, FileCode2, FilePlus2, History,
  LoaderCircle, Monitor, Package, Pencil, Play, Plus, RefreshCw, Replace, Save,
  ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import {
  getGetTinanaiBuilderProjectQueryKey,
  getListTinanaiBuilderProjectsQueryKey,
  getListTinanaiBuilderProjectVersionsQueryKey,
  useCreateTinanaiBuilderProject,
  useDeleteTinanaiBuilderProject,
  useDuplicateTinanaiBuilderProject,
  useGenerateTinanaiBuilder,
  useGetTinanaiBuilderProject,
  useListTinanaiBuilderProjects,
  useListTinanaiBuilderProjectVersions,
  useRestoreTinanaiBuilderProjectVersion,
  useUpdateTinanaiBuilderProject,
} from '@workspace/api-client-react';
import type {
  TinanaiBuilderProjectFile,
  TinanaiBuilderProjectInput,
  TinanaiBuilderProjectSummary,
  TinanaiBuilderProjectVersion,
  TinanaiBuilderResponse,
} from '@workspace/api-client-react';
import { zipSync } from 'fflate';
import { Btn, Card, ErrorNote, Field, Input, Select, Textarea } from '@/components/kit';
import { download, downloadBytes, errMsg } from '@/lib/helpers';
import { BuilderOutput } from '@/components/builder-output';
import { BuilderAiImprovementPanel, type BuilderAiProposalView } from '@/components/builder-ai-improvement-panel';
import { BuilderAgentPanel } from '@/components/builder-agent-panel';
import { BuilderPreviewScreen } from '@/components/builder-preview-screen';
import { now, uid, useWorkspace, type Project as LocalProject } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { resolveLocalProjectPath, resolvePreviewPage } from '@/lib/project-preview';
import { builderGenerationErrorMessage } from '@/lib/builder-request-errors';
import {
  builderProjectSignature,
  countLiteralMatches,
  isSafeBuilderFilePath,
  renameBuilderFile,
  replaceLiteral,
} from '@/lib/builder-editor';
import { composeBuilderAppPrompt, createBuilderImprovementBrief, maxBuilderAppPromptLength, type BuilderDesignDirection } from '@/lib/builder-app-prompt';
import { compareBuilderFiles, type BuilderFileChange } from '@/lib/builder-file-changes';

const FILE_LIMIT = 20;
const UPLOAD_EXTENSIONS = new Set(['.zip', '.json', '.csv', '.xlsx', '.pdf', '.txt', '.md', '.mdx', '.sol', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.cs', '.php', '.rb', '.sh', '.sql', '.html', '.htm', '.css', '.scss', '.yaml', '.yml', '.toml', '.xml', '.vue', '.svelte', '.properties']);
const APP_TYPE_OPTIONS = [
  ['web_app', 'Web app'], ['dashboard', 'Dashboard'], ['task_manager', 'Task manager'], ['landing_page', 'Landing page'],
] as const;
const APP_DESIGN_OPTIONS = [
  ['auto', 'Match the brief'], ['dark', 'Dark workspace'], ['light', 'Light editorial'], ['warm', 'Warm neutral'],
] as const;
const AI_SOURCE_EXTENSIONS = new Set([
  '.txt', '.md', '.mdx', '.sol', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java',
  '.c', '.h', '.cpp', '.cs', '.php', '.rb', '.sh', '.sql', '.html', '.htm', '.css', '.scss', '.json', '.yaml',
  '.yml', '.toml', '.xml', '.vue', '.svelte', '.properties',
]);
const MAX_AI_SOURCE_ARCHIVE_BYTES = 20 * 1024 * 1024;
type AppType = TinanaiBuilderProjectInput['appType'];
type Template = TinanaiBuilderProjectInput['template'];
type Checks = { status: 'not_run' | 'passed' | 'failed' | 'blocked'; details: string; at: string | null };
type EditableProject = {
  id: string | null; name: string; description: string; appType: AppType; template: Template;
  files: TinanaiBuilderProjectFile[]; source: 'local' | 'server' | 'draft'; summary?: TinanaiBuilderProjectSummary;
};
type BuilderAiProposal = BuilderAiProposalView & {
  files: TinanaiBuilderProjectFile[];
  changes: BuilderFileChange[];
  projectId: string | null;
  projectSource: EditableProject['source'];
  baseSignature: string;
};

const mediaType = (path: string) => path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/plain';
const fileName = (path: string) => path.split('/').pop() ?? path;
const readable = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const codeFiles = (files: TinanaiBuilderProjectFile[]) => files.filter((file) => /\.(html?|css|m?js)$/i.test(file.path));
const safeScript = (source: string) => !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|indexedDB|localStorage|sessionStorage|caches|serviceWorker|importScripts|SharedWorker|Worker|eval|Function|location|history)\b|document\s*\.\s*cookie|window\s*\.\s*open|import\s*\(/i.test(source);
const redactSecrets = (source: string) => source
  .replace(/\b(api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|password|secret|auth[_-]?token|token)\b(\s*[:=]\s*)(["'])([^"'\r\n]{8,})\3/gi, (_match, key: string, separator: string, quote: string) => `${key}${separator}${quote}[REDACTED]${quote}`)
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi, 'Bearer [REDACTED]')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]');

function templateFiles(template: Template): TinanaiBuilderProjectFile[] {
  const base = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${template === 'task_manager' ? 'Today, in focus' : template === 'dashboard' ? 'Field notes' : 'A quiet starting point'}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="shell">
    <p class="kicker">${template === 'blank' ? 'STATIC STARTER' : 'LOCAL TEMPLATE'}</p>
    <h1>${template === 'task_manager' ? 'Make room for the work.' : template === 'dashboard' ? 'A clearer picture.' : 'Start with one good idea.'}</h1>
    <p class="intro">${template === 'task_manager' ? 'A small task list, stored only in this page while it is open.' : template === 'dashboard' ? 'A compact dashboard canvas, ready for your own measures.' : 'Your project starts here. Edit the source, then preview it safely.'}</p>
    ${template === 'task_manager' ? '<form id="task-form" class="task-form"><label class="sr-only" for="task-title">New task</label><input id="task-title" type="text" maxlength="120" placeholder="Add a task" required><button type="submit">Add task</button></form><label class="filter-row" for="task-filter">Show <select id="task-filter"><option value="all">All tasks</option><option value="active">Active</option><option value="done">Completed</option></select></label><ul id="task-list" class="task-list"></ul><p id="empty-state" class="empty-state" aria-live="polite"></p><p class="notice">Tasks stay in memory in this preview and reset when it reloads.</p>' : template === 'dashboard' ? '<div class="measure"><span>Workspace signal</span><strong>Ready for your data</strong></div><div class="measure"><span>Next step</span><strong>Choose what matters</strong></div>' : '<a class="start" href="#next">Open the editor</a>'}
  </main>
  <script src="app.js"></script>
</body>
</html>`;
  const js = template === 'task_manager'
    ? `const form=document.querySelector('#task-form');const input=document.querySelector('#task-title');const list=document.querySelector('#task-list');const filterSelect=document.querySelector('#task-filter');const empty=document.querySelector('#empty-state');let tasks=[{id:1,title:'Shape the first useful version',done:false}];let filter='all';function renderTasks(){list.replaceChildren();const visible=tasks.filter((task)=>filter==='all'||(filter==='done'?task.done:!task.done));empty.textContent=visible.length?'':filter==='all'?'No tasks yet. Add one above.':'No tasks in this filter.';for(const task of visible){const row=document.createElement('li');const check=document.createElement('input');check.type='checkbox';check.checked=task.done;check.setAttribute('aria-label','Mark '+task.title+' complete');check.addEventListener('change',()=>{tasks=tasks.map((item)=>item.id===task.id?{...item,done:check.checked}:item);renderTasks()});const title=document.createElement('span');title.textContent=task.title;if(task.done)title.className='done';const remove=document.createElement('button');remove.type='button';remove.className='remove-task';remove.textContent='Remove';remove.addEventListener('click',()=>{tasks=tasks.filter((item)=>item.id!==task.id);renderTasks()});row.append(check,title,remove);list.append(row)}}form.addEventListener('submit',(event)=>{event.preventDefault();const title=input.value.trim();if(!title)return;tasks.push({id:Date.now(),title,done:false});input.value='';renderTasks()});filterSelect.addEventListener('change',()=>{filter=filterSelect.value;renderTasks()});renderTasks();`
    : `console.info('Static template loaded.');`;
  const css = `:root{font-family:system-ui,sans-serif;color:#e6eef5;background:#0d1928}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 85% 8%,#16465a 0,transparent 34%),#0d1928}.shell{width:min(760px,100%);margin:0 auto;padding:clamp(32px,8vw,88px) 24px}.kicker{font-size:11px;letter-spacing:.18em;color:#77d7df;font-weight:700}.shell h1{font-size:clamp(40px,8vw,72px);line-height:1.02;letter-spacing:-.055em;max-width:680px;margin:26px 0}.intro{font-size:17px;line-height:1.7;color:#a8bac8;max-width:540px}.start,button{display:inline-flex;margin-top:26px;border:1px solid #63cad4;border-radius:8px;padding:12px 17px;color:#d9fbfc;text-decoration:none;background:#123542;font-weight:650;cursor:pointer}.task,.measure{margin-top:14px;padding:16px;border:1px solid #31485c;border-radius:10px;background:#122338}.measure span{display:block;color:#9db0c2;font-size:13px}.measure strong{display:block;margin-top:8px}.task input{accent-color:#6acbd3}.task-form{display:flex;gap:10px;margin-top:26px}.task-form input{min-width:0;flex:1;border:1px solid #31485c;border-radius:8px;background:#122338;padding:12px;color:#e6eef5}.task-form button{margin-top:0}.filter-row{display:flex;align-items:center;gap:10px;margin-top:20px;color:#a8bac8;font-size:13px}.filter-row select{border:1px solid #31485c;border-radius:8px;background:#122338;padding:8px;color:#e6eef5}.task-list{list-style:none;margin:12px 0;padding:0}.task-list li{display:flex;align-items:center;gap:12px;margin-top:8px;padding:14px;border:1px solid #31485c;border-radius:10px;background:#122338}.task-list input{accent-color:#6acbd3}.task-list .done{text-decoration:line-through;color:#8ba0b2}.task-list .remove-task{margin:0 0 0 auto;padding:6px 9px;font-size:12px}.empty-state,.notice{color:#9db0c2;font-size:13px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
  return [
    { path: 'index.html', content: base, mediaType: 'text/html' },
    { path: 'styles.css', content: css, mediaType: 'text/css' },
    { path: 'app.js', content: js, mediaType: 'text/javascript' },
  ];
}

function makePreview(files: TinanaiBuilderProjectFile[], stamp: string, entryPath = 'index.html'): string {
  const entry = files.find((file) => file.path === entryPath);
  if (!entry) return '';
  const localFiles = codeFiles(files).map((file) => ({ ...file, content: redactSecrets(file.content) }));
  const byPath = new Map(localFiles.map((file) => [file.path, file.content]));
  let html = redactSecrets(entry.content);
  html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+(?:href|src)\s*=\s*(["'])\s*(?:javascript:|https?:\/\/|\/\/)[\s\S]*?\1/gi, '');
  html = html.replace(/<link\b([^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*)>/gi, (tag, _attrs: string, src: string) => {
     if (!/\.css(?:[?#].*)?$/i.test(src)) return '';
     const css = byPath.get(resolveLocalProjectPath(entry.path, src) ?? '');
    return css === undefined ? '' : `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
  html = html.replace(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>\s*<\/script>/gi, (_tag, attrs: string, src: string) => {
     if (!/\.m?js(?:[?#].*)?$/i.test(src)) return '';
     const js = byPath.get(resolveLocalProjectPath(entry.path, src) ?? '');
    return js === undefined || !safeScript(js) ? '' : `<script${attrs.replace(/\s+src\s*=\s*(["'])[^"']+\1/i, '')}>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
  });
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_tag, attrs: string, js: string) =>
    safeScript(js) ? `<script${attrs}>${js}</script>` : '<!-- Script blocked: unsupported browser APIs or dynamic execution -->',
  );
  const runtime = `<script>(function(){var id=${JSON.stringify(stamp)};function send(kind,message){try{parent.postMessage({type:'tinanai-preview',id:id,kind:kind,message:String(message||'')},'*')}catch(_){}}['log','info','warn','error'].forEach(function(level){var original=console[level];console[level]=function(){send(level,level+': '+Array.prototype.join.call(arguments,' '));if(original)original.apply(console,arguments)}});document.addEventListener('click',function(event){var target=event.target;var link=target&&target.closest?target.closest('a'):null;if(!link)return;var href=link.getAttribute('href')||'';if(href&&href.charAt(0)!=='#'){event.preventDefault();send('navigate',href)}},true);window.addEventListener('error',function(e){send('error',e.message||'Script error')});window.addEventListener('unhandledrejection',function(e){send('error',e.reason&&e.reason.message||e.reason||'Unhandled promise rejection')});window.addEventListener('DOMContentLoaded',function(){send('ready','Preview loaded')})})();</script>`;
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'">`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}${runtime}`);
  else html = `${policy}${runtime}${html}`;
  return html;
}

function updatePreviewPageUrl(page: string, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  const state = `${url.pathname}${url.search}${url.hash}`;
  if (replace) window.history.replaceState({}, '', state);
  else window.history.pushState({}, '', state);
}

function localSummary(project: LocalProject): TinanaiBuilderProjectSummary {
  return {
    id: project.id, name: project.name, description: project.description, appType: project.appType ?? 'web_app',
    framework: 'static_html', template: project.template ?? 'ai_generated', version: 1, previewStatus: project.previewStatus ?? 'not_run',
    buildStatus: project.buildStatus === 'blocked' ? 'failed' : project.buildStatus ?? 'not_run',
    buildDetails: project.buildDetails ?? null, buildAt: project.buildAt ?? null,
    testStatus: project.testStatus ?? 'not_run', testDetails: project.testDetails ?? null,
    testAt: project.testAt ?? null, createdAt: project.createdAt, updatedAt: project.updatedAt,
  };
}

function StatusPill({ status }: { status: string }) {
  const passed = status === 'passed' || status === 'ready';
  const failed = status === 'failed' || status === 'error';
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${passed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : failed ? 'border-rose-300/25 bg-rose-300/10 text-rose-200' : 'border-border bg-secondary/60 text-muted-foreground'}`}>{status.replace('_', ' ')}</span>;
}

export default function Builder() {
  const { locale } = useI18n();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: workspace, upsert, remove } = useWorkspace();
  const { toast } = useToast();
  const generation = useGenerateTinanaiBuilder();
  const createProject = useCreateTinanaiBuilderProject();
  const updateProject = useUpdateTinanaiBuilderProject();
  const deleteProject = useDeleteTinanaiBuilderProject();
  const duplicateProject = useDuplicateTinanaiBuilderProject();
  const restoreVersion = useRestoreTinanaiBuilderProjectVersion();
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const autoSelectedPreviewRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAccountIdRef = useRef<string | null>(null);
  const frameErrorRef = useRef(false);
  const previewSavedRef = useRef('');
  const previewStatusPersistRef = useRef<(status: 'ready' | 'error') => void>(() => {});
  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<TinanaiBuilderResponse['outputType']>('app');
  const [generationAppType, setGenerationAppType] = useState<AppType>('web_app');
  const [designDirection, setDesignDirection] = useState<BuilderDesignDirection>('auto');
  const [uploads, setUploads] = useState<File[]>([]);
  const [result, setResult] = useState<TinanaiBuilderResponse | null>(null);
  const [improvementPrompt, setImprovementPrompt] = useState('');
  const [improvementError, setImprovementError] = useState('');
  const [aiProposal, setAiProposal] = useState<BuilderAiProposal | null>(null);
  const [project, setProject] = useState<EditableProject | null>(null);
  const [activePath, setActivePath] = useState('index.html');
  const [fileFilter, setFileFilter] = useState('');
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [frameLogs, setFrameLogs] = useState<string[]>([]);
  const [previewStatus, setPreviewStatus] = useState<'not_run' | 'ready' | 'error'>('not_run');
  const [previewProjectId, setPreviewProjectId] = useState(() => new URLSearchParams(window.location.search).get('preview') ?? '');
  const [previewEntryPath, setPreviewEntryPath] = useState(() => new URLSearchParams(window.location.search).get('page') ?? 'index.html');
  const [previewRouteError, setPreviewRouteError] = useState('');
  const [build, setBuild] = useState<Checks>({ status: 'not_run', details: '', at: null });
  const [smoke, setSmoke] = useState<Checks>({ status: 'not_run', details: '', at: null });
  const [checking, setChecking] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [appTypeDraft, setAppTypeDraft] = useState<AppType>('web_app');
  const [templateDraft, setTemplateDraft] = useState<Template>('blank');
  const [createOpen, setCreateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draggingUploads, setDraggingUploads] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  const listQuery = useListTinanaiBuilderProjects({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: [...getListTinanaiBuilderProjectsQueryKey(), userId], refetchOnMount: 'always' },
  });
  const localProjects = workspace.projects;
  const serverProjects = listQuery.data?.projects ?? [];
  const projectList = isSignedIn ? serverProjects : localProjects.map(localSummary);
  const serverId = project?.source === 'server' ? project.id : null;
  const detailQuery = useGetTinanaiBuilderProject(serverId ?? '', {
    query: { enabled: !!serverId && !!isSignedIn, queryKey: [...getGetTinanaiBuilderProjectQueryKey(serverId ?? ''), userId] },
  });
  const versionsQuery = useListTinanaiBuilderProjectVersions(serverId ?? '', {
    query: { enabled: !!serverId && !!isSignedIn && historyOpen, queryKey: [...getListTinanaiBuilderProjectVersionsQueryKey(serverId ?? ''), userId] },
  });
  const versionList: TinanaiBuilderProjectVersion[] = versionsQuery.data?.versions ?? [];

  useEffect(() => {
    if (!isLoaded) return;
    const nextAccountId = isSignedIn ? userId ?? null : null;
    if (lastAccountIdRef.current !== nextAccountId) {
      const previousAccountId = lastAccountIdRef.current;
      lastAccountIdRef.current = nextAccountId;
      if (previousAccountId !== null || projectRef.current?.source === 'server') {
        setProject(null);
        setSavedSignature(null);
        setResult(null);
        setFrameLogs([]);
        setHistoryOpen(false);
        setPreviewStatus('not_run');
        setBuild({ status: 'not_run', details: '', at: null });
        setSmoke({ status: 'not_run', details: '', at: null });
        frameErrorRef.current = false;
        previewSavedRef.current = '';
        if (timerRef.current) clearTimeout(timerRef.current);
        setChecking(false);
        autoSelectedPreviewRef.current = null;
      }
    }
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    const syncPreviewRoute = () => {
      const nextId = new URLSearchParams(window.location.search).get('preview') ?? '';
      const nextPage = new URLSearchParams(window.location.search).get('page') ?? 'index.html';
      setPreviewProjectId(nextId);
      setPreviewEntryPath(nextPage);
      setPreviewRouteError('');
      frameErrorRef.current = false;
      previewSavedRef.current = '';
      setPreviewStatus('not_run');
      setFrameLogs([]);
      setFrameKey((current) => current + 1);
    };
    window.addEventListener('popstate', syncPreviewRoute);
    return () => window.removeEventListener('popstate', syncPreviewRoute);
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== 'tinanai-preview') return;
      if (event.data.id !== `${frameKey}`) return;
      const kind = String(event.data.kind ?? 'console');
      if (kind === 'navigate') {
        const nextPage = resolvePreviewPage(project?.files ?? [], previewEntryPath, String(event.data.message ?? ''));
        if (nextPage) {
          updatePreviewPageUrl(nextPage);
          setPreviewEntryPath(nextPage);
          frameErrorRef.current = false;
          previewSavedRef.current = '';
          setPreviewStatus('not_run');
          setFrameLogs([]);
          setFrameKey((current) => current + 1);
        } else {
          setFrameLogs((current) => [...current, 'Warning: Navigation is blocked or the local page was not found.'].slice(-60));
        }
        return;
      }
      const prefix = kind === 'error' ? 'Error' : kind === 'warn' ? 'Warning' : 'Info';
      setFrameLogs((current) => [...current, `${prefix}: ${redactSecrets(String(event.data.message ?? '').slice(0, 500))}`].slice(-60));
      if (kind === 'error') {
        frameErrorRef.current = true;
        setPreviewStatus('error');
        previewStatusPersistRef.current('error');
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [frameKey, project?.files, project?.id, project?.source, previewEntryPath]);

  useEffect(() => {
    if (detailQuery.data?.project && project?.source === 'server' && detailQuery.data.project.id === project.id) {
      const loaded = detailQuery.data.project;
      setProject((current) => current?.id === loaded.id ? {
        id: loaded.id, name: loaded.name, description: loaded.description, appType: loaded.appType,
        template: loaded.template, files: loaded.files, source: 'server', summary: loaded,
      } : current);
      setSavedSignature(builderProjectSignature({
        name: loaded.name,
        description: loaded.description,
        appType: loaded.appType,
        template: loaded.template,
        files: loaded.files,
      }));
      setNameDraft(loaded.name);
      setDescriptionDraft(loaded.description);
      setAppTypeDraft(loaded.appType);
      setTemplateDraft(loaded.template);
      setActivePath((current) => loaded.files.some((file) => file.path === current) ? current : loaded.files[0]?.path ?? 'index.html');
      resetPreview();
      setBuild({ status: loaded.buildStatus, details: loaded.buildDetails ?? '', at: loaded.buildAt });
      setSmoke({ status: loaded.testStatus, details: loaded.testDetails ?? '', at: loaded.testAt });
    }
  }, [detailQuery.data, project?.id, project?.source]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const currentFiles = project?.files ?? [];
  const promptLimit = outputType === 'app' ? maxBuilderAppPromptLength(generationAppType, designDirection) : 12_000;
  const activeFile = currentFiles.find((file) => file.path === activePath) ?? currentFiles[0];
  const currentSignature = project ? builderProjectSignature({
    name: nameDraft,
    description: descriptionDraft,
    appType: appTypeDraft,
    template: project.template,
    files: project.files,
  }) : null;
  const isDirty = !!project && (project.source === 'draft' || (savedSignature !== null && savedSignature !== currentSignature));
  const aiProposalIsStale = !!aiProposal && (
    !project
    || aiProposal.projectId !== project.id
    || aiProposal.projectSource !== project.source
    || aiProposal.baseSignature !== currentSignature
  );
  const visibleFiles = currentFiles.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase()));
  const matchCount = activeFile ? countLiteralMatches(activeFile.content, findTerm) : 0;
  const previewSrc = useMemo(() => project ? makePreview(project.files, `${frameKey}`) : '', [project?.files, frameKey]);
  const previewPages = useMemo(
    () => project?.files.filter((file) => /\.html?$/i.test(file.path)).map((file) => file.path) ?? [],
    [project?.files],
  );
  const previewActivePage = previewPages.includes(previewEntryPath) ? previewEntryPath : previewPages[0] ?? '';
  const fullPreviewSrc = useMemo(
    () => project?.id === previewProjectId && previewActivePage ? makePreview(project.files, `${frameKey}`, previewActivePage) : '',
    [project?.id, project?.files, previewProjectId, frameKey, previewActivePage],
  );
  const currentProjectName = project?.name ?? '';
  const currentDescription = project?.description ?? '';

  const invalidateProjects = async (id?: string) => {
    await queryClient.invalidateQueries({ queryKey: getListTinanaiBuilderProjectsQueryKey() });
    if (id) {
      await queryClient.invalidateQueries({ queryKey: getGetTinanaiBuilderProjectQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListTinanaiBuilderProjectVersionsQueryKey(id) });
    }
  };

  const resetPreview = () => {
    frameErrorRef.current = false;
    previewSavedRef.current = '';
    setPreviewStatus('not_run');
    setFrameLogs([]);
    setFrameKey((current) => current + 1);
  };

  const persistLocalMetadata = (patch: Partial<LocalProject>) => {
    if (project?.source !== 'local' || !project.id) return;
    const saved = localProjects.find((item) => item.id === project.id);
    if (saved) upsert('projects', { ...saved, ...patch, updatedAt: now() });
  };

  const persistPreviewStatus = (status: 'ready' | 'error') => {
    if (project?.source === 'local' && project.id) {
      persistLocalMetadata({ previewStatus: status });
      return;
    }
    if (project?.source !== 'server' || !project.id) return;
    const saveKey = `${project.id}:${status}`;
    if (previewSavedRef.current === saveKey) return;
    previewSavedRef.current = saveKey;
    const id = project.id;
    void updateProject.mutateAsync({ id, data: { previewStatus: status } })
      .then(() => invalidateProjects(id))
      .catch((previewError: unknown) => setError(`Preview status could not be saved: ${errMsg(previewError)}`));
  };
  previewStatusPersistRef.current = persistPreviewStatus;

  const handlePreviewLoad = () => {
    const status = frameErrorRef.current ? 'error' : 'ready';
    setPreviewStatus(status);
    persistPreviewStatus(status);
    if (checking) setSmoke({ status: 'not_run', details: 'Preview loaded', at: null });
  };

  const setFiles = (files: TinanaiBuilderProjectFile[]) => {
    setProject((current) => current ? { ...current, files } : current);
    setBuild({ status: 'not_run', details: 'Source changed; run the static checks again.', at: null });
    setSmoke({ status: 'not_run', details: 'Source changed; run the smoke test again.', at: null });
    resetPreview();
  };

  const chooseProject = async (summary: TinanaiBuilderProjectSummary) => {
    setError('');
    setResult(null);
    generation.reset();
    resetPreview();
    if (isSignedIn) {
      setProject({
        id: summary.id, name: summary.name, description: summary.description, appType: summary.appType,
        template: summary.template, files: [], source: 'server', summary,
      });
      setSavedSignature(null);
      setFileFilter('');
      setHistoryOpen(false);
      return;
    }
    const saved = localProjects.find((item) => item.id === summary.id);
    if (!saved) return;
    const files = saved.files?.length ? saved.files : [{ path: 'index.html', content: saved.html, mediaType: 'text/html' }];
    setProject({
      id: saved.id, name: saved.name, description: saved.description, appType: saved.appType ?? 'web_app',
      template: saved.template ?? 'ai_generated', files, source: 'local',
    });
    setSavedSignature(builderProjectSignature({
      name: saved.name,
      description: saved.description,
      appType: saved.appType ?? 'web_app',
      template: saved.template ?? 'ai_generated',
      files,
    }));
    setFileFilter('');
    setNameDraft(saved.name);
    setDescriptionDraft(saved.description);
    setAppTypeDraft(saved.appType ?? 'web_app');
    setTemplateDraft(saved.template ?? 'ai_generated');
    setActivePath(files.some((file) => file.path === activePath) ? activePath : 'index.html');
    setHistoryOpen(false);
    setPreviewStatus(saved.previewStatus ?? 'not_run');
    setBuild({ status: saved.buildStatus ?? 'not_run', details: saved.buildDetails ?? '', at: saved.buildAt ?? null });
    setSmoke({ status: saved.testStatus ?? 'not_run', details: saved.testDetails ?? '', at: saved.testAt ?? null });
  };

  const setPreviewLocation = (id: string | null, page = 'index.html') => {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('preview', id);
      url.searchParams.set('page', page);
      setPreviewEntryPath(page);
    } else {
      url.searchParams.delete('preview');
      url.searchParams.delete('page');
      setPreviewEntryPath('index.html');
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setPreviewProjectId(id ?? '');
    setPreviewRouteError('');
  };

  const openProjectPreview = async (summary: TinanaiBuilderProjectSummary) => {
    setError('');
    setPreviewRouteError('');
    if (isSignedIn) {
      await queryClient.invalidateQueries({ queryKey: getGetTinanaiBuilderProjectQueryKey(summary.id) });
    }
    await chooseProject(summary);
    autoSelectedPreviewRef.current = summary.id;
    setPreviewLocation(summary.id, 'index.html');
  };

  useEffect(() => {
    if (!previewProjectId) {
      autoSelectedPreviewRef.current = null;
      return;
    }
    if (!isLoaded) return;
    if (project?.id === previewProjectId) {
      if (project.source === 'server' && detailQuery.isError && !project.files.length) {
        setPreviewRouteError('The saved source could not be loaded. Return to the Builder and retry.');
      }
      return;
    }
    if (autoSelectedPreviewRef.current === previewProjectId) return;
    if (isSignedIn && listQuery.isLoading) return;
    if (isSignedIn && listQuery.isError) {
      autoSelectedPreviewRef.current = previewProjectId;
      setPreviewRouteError('Your saved projects could not be loaded. Return to the Builder and retry.');
      return;
    }
    const summary = projectList.find((item) => item.id === previewProjectId);
    if (!summary) {
      autoSelectedPreviewRef.current = previewProjectId;
      setPreviewRouteError('This project is unavailable or is not owned by the current account.');
      return;
    }
    autoSelectedPreviewRef.current = previewProjectId;
    setPreviewEntryPath('index.html');
    setPreviewRouteError('');
    void chooseProject(summary);
  }, [previewProjectId, isLoaded, isSignedIn, listQuery.isLoading, listQuery.isError, project?.id, project?.source, project?.files.length, detailQuery.isError, projectList]);

  useEffect(() => {
    if (project?.id !== previewProjectId || !project.files.length) return;
    if (project.files.some((file) => file.path === previewEntryPath)) return;
    const fallback = project.files.some((file) => file.path === 'index.html')
      ? 'index.html'
      : project.files.find((file) => /\.html?$/i.test(file.path))?.path ?? 'index.html';
    setPreviewEntryPath(fallback);
    updatePreviewPageUrl(fallback, true);
  }, [project?.id, project?.files, previewProjectId, previewEntryPath]);

  const closeProjectPreview = () => setPreviewLocation(null);
  const openProjectEditor = () => {
    closeProjectPreview();
    window.setTimeout(() => {
      document.querySelector('[data-testid="panel-project-editor"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };
  const openPreviewInNewWindow = () => {
    if (previewProjectId) window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };
  const togglePreviewFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => toast({ title: 'Fullscreen could not be closed', description: 'Use Escape to leave fullscreen mode.' }));
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => toast({ title: 'Fullscreen is unavailable', description: 'This browser did not allow fullscreen mode.' }));
  };
  const refreshFullPreview = () => window.location.reload();

  const createFromTemplate = () => {
    const files = templateFiles(templateDraft);
    const next: EditableProject = {
      id: null, name: nameDraft.trim() || 'Untitled project', description: descriptionDraft.trim(),
      appType: appTypeDraft, template: templateDraft, files, source: 'draft',
    };
    setProject(next);
    setSavedSignature(null);
    setFileFilter('');
    setActivePath('index.html');
    setBuild({ status: 'not_run', details: '', at: null });
    setSmoke({ status: 'not_run', details: '', at: null });
    resetPreview();
    setCreateOpen(false);
    setResult(null);
    setAiProposal(null);
    setImprovementError('');
    setError('');
    generation.reset();
    toast({ title: templateDraft === 'blank' ? 'Blank static project created' : 'Local template opened', description: 'This is a deterministic starter, not AI-generated output.' });
  };

  const generate = async () => {
    if (!prompt.trim()) { setError('Add instructions before generating.'); return; }
    if (outputType === 'app' && prompt.trim().length > promptLimit) {
      setError(`Shorten the brief to ${promptLimit.toLocaleString(locale)} characters for the selected app type and design.`);
      return;
    }
    setError('');
    generation.reset();
    try {
      const requestPrompt = outputType === 'app'
        ? composeBuilderAppPrompt(prompt, generationAppType, designDirection)
        : prompt.trim();
      const response = await generation.mutateAsync({ data: { outputType, prompt: requestPrompt, files: uploads, language: locale } });
      setResult(response);
      if (response.outputType === 'app') {
        const htmlFiles = response.artifacts.map((artifact) => ({ ...artifact }));
        const nextFiles = htmlFiles.length ? htmlFiles.slice(0, FILE_LIMIT) : [];
        if (nextFiles.length) {
          const title = prompt.trim().slice(0, 80) || 'Generated project';
          setAiProposal(null);
          setImprovementError('');
          setProject({
            id: null, name: title, description: prompt.trim().slice(0, 1000), appType: generationAppType,
            template: 'ai_generated', files: nextFiles, source: 'draft',
          });
          setSavedSignature(null);
          setFileFilter('');
          setNameDraft(title);
          setDescriptionDraft(prompt.trim().slice(0, 1000));
          setAppTypeDraft(generationAppType);
          setTemplateDraft('ai_generated');
          setActivePath(nextFiles.some((file) => file.path === 'index.html') ? 'index.html' : nextFiles[0].path);
          setBuild({ status: 'not_run', details: '', at: null });
          setSmoke({ status: 'not_run', details: '', at: null });
           resetPreview();
        } else {
          setError('The response did not include app files. No app was generated; use a local template or retry.');
        }
      }
    } catch (requestError) {
      setResult(null);
      setError(builderGenerationErrorMessage(requestError, outputType));
    }
  };

  const improveWithAi = async () => {
    if (!project || !improvementPrompt.trim()) return;
    const baseSignature = currentSignature;
    if (!baseSignature) {
      setImprovementError('The current project could not be captured. Reload it and try again.');
      return;
    }

    const sourceFiles = project.files.filter((file) => {
      const extension = `.${file.path.split('.').pop()?.toLowerCase() ?? ''}`;
      return AI_SOURCE_EXTENSIONS.has(extension);
    });
    if (sourceFiles.length === 0) {
      setImprovementError('This project has no supported text source files to send for an AI improvement.');
      return;
    }
    if (sourceFiles.some((file) => !isSafeBuilderFilePath(file.path))) {
      setImprovementError('The project contains an unsafe file path. Fix the path before requesting an AI improvement.');
      return;
    }

    setImprovementError('');
    setResult(null);
    generation.reset();
    try {
      const sourceEntries: Record<string, Uint8Array> = {};
      for (const file of sourceFiles) {
        sourceEntries[file.path] = new TextEncoder().encode(redactSecrets(file.content));
      }
      const archiveBytes = zipSync(sourceEntries, { level: 6 });
      if (archiveBytes.byteLength > MAX_AI_SOURCE_ARCHIVE_BYTES) {
        throw new Error('The source archive is larger than 20 MB. Remove large files and try again.');
      }
      const sourceArchive = new File([archiveBytes], 'current-project.zip', { type: 'application/zip' });
      const improvementBrief = createBuilderImprovementBrief(
        redactSecrets(project.name),
        redactSecrets(project.description),
        redactSecrets(improvementPrompt),
      );
      const requestPrompt = composeBuilderAppPrompt(improvementBrief, project.appType, designDirection);

      const response = await generation.mutateAsync({
        data: { outputType: 'app', prompt: requestPrompt, files: [sourceArchive], language: locale },
      });
      if (response.outputType !== 'app') {
        throw new Error('The AI response was not an app proposal. Your current project was not changed.');
      }
      const generatedFiles = response.artifacts.map((artifact) => ({ ...artifact }));
      if (!generatedFiles.some((file) => file.path === 'index.html')) {
        throw new Error('The proposal did not include a root index.html. Your current project was not changed.');
      }
      if (
        generatedFiles.length > FILE_LIMIT
        || generatedFiles.some((file) => !isSafeBuilderFilePath(file.path))
        || new Set(generatedFiles.map((file) => file.path)).size !== generatedFiles.length
      ) {
        throw new Error(`The proposal has unsafe or duplicate paths, or exceeds the ${FILE_LIMIT}-file limit. Your current project was not changed.`);
      }

      const generatedPaths = new Set(generatedFiles.map((file) => file.path));
      const supportedSourcePaths = new Set(sourceFiles.map((file) => file.path));
      const preservedFiles = project.files.filter((file) => !supportedSourcePaths.has(file.path) && !generatedPaths.has(file.path));
      const proposedFiles = [...generatedFiles, ...preservedFiles];
      if (proposedFiles.length > FILE_LIMIT) {
        throw new Error(`The proposal would exceed the ${FILE_LIMIT}-file project limit after preserving unsupported assets. Your current project was not changed.`);
      }
      const totalBytes = proposedFiles.reduce((sum, file) => sum + new TextEncoder().encode(file.content).byteLength, 0);
      if (totalBytes > 2_000_000) {
        throw new Error('The proposal exceeds the 2 MB project limit. Your current project was not changed.');
      }

      const changes = compareBuilderFiles(project.files, proposedFiles);
      setAiProposal({
        projectId: project.id,
        projectSource: project.source,
        baseSignature,
        summary: redactSecrets(response.summary),
        files: proposedFiles,
        changes,
      });
    } catch (requestError) {
      if (requestError instanceof Error && !('status' in requestError)) {
        setImprovementError(redactSecrets(requestError.message) || 'The AI proposal could not be prepared.');
      } else {
        setImprovementError(builderGenerationErrorMessage(requestError, 'app'));
      }
    }
  };

  const applyAiProposal = () => {
    if (!project || !aiProposal) return;
    if (aiProposalIsStale) {
      setImprovementError('The project has changed since this proposal was created. Request a new proposal before applying it.');
      return;
    }
    if (!aiProposal.changes.length) {
      setImprovementError('The proposal contains no file changes to apply.');
      return;
    }
    setProject({ ...project, template: 'ai_generated', files: aiProposal.files });
    setActivePath('index.html');
    setBuild({ status: 'not_run', details: '', at: null });
    setSmoke({ status: 'not_run', details: '', at: null });
    setAiProposal(null);
    setImprovementError('');
    resetPreview();
    toast({ title: 'AI changes applied', description: 'Review the preview and save the project when you are ready.' });
  };

  const discardAiProposal = () => {
    setAiProposal(null);
    setImprovementError('');
  };

  const downloadAiProposal = () => {
    if (!project || !aiProposal) return;
    const entries: Record<string, Uint8Array> = {
      'TINANAI-PROPOSAL.md': new TextEncoder().encode(
        redactSecrets(`# ${project.name} · AI proposal\n\n${aiProposal.summary}\n\nThis is a proposed static HTML/CSS/JavaScript project. Review source before using it outside the TINANAI sandbox.`),
      ),
    };
    for (const file of aiProposal.files) {
      if (isSafeBuilderFilePath(file.path)) entries[file.path] = new TextEncoder().encode(redactSecrets(file.content));
    }
    const archiveName = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'}-ai-proposal.zip`;
    downloadBytes(archiveName, zipSync(entries, { level: 6 }), 'application/zip');
  };

  const save = async () => {
    if (!project) return;
    const name = nameDraft.trim() || 'Untitled project';
    const files = project.files;
    if (!files.length || !files.some((file) => file.path === 'index.html')) {
      setError('A project needs index.html before it can be saved or previewed.');
      return;
    }
    if (!files.every((file) => isSafeBuilderFilePath(file.path)) || files.length > FILE_LIMIT) {
      setError(`Use safe relative file paths and no more than ${FILE_LIMIT} files.`);
      return;
    }
    const totalSourceBytes = files.reduce((total, file) => total + new TextEncoder().encode(file.content).length, 0);
    if (totalSourceBytes > 2_000_000) {
      setError('Combined project source exceeds the 2 MB storage limit.');
      return;
    }
    if (files.some((file) => redactSecrets(file.content) !== file.content)) {
      setError('Remove secret-like values before saving project files. They are not sent to your account workspace.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (project.source === 'server' && project.id) {
        const response = await updateProject.mutateAsync({
          id: project.id, data: {
            name, description: descriptionDraft.slice(0, 1000), appType: appTypeDraft,
            framework: 'static_html', template: project.template, files,
            previewStatus, buildStatus: build.status, buildDetails: build.details || null, buildAt: build.at,
            testStatus: smoke.status, testDetails: smoke.details || null, testAt: smoke.at,
          },
        });
        setProject((current) => current ? { ...current, ...response.project, source: 'server' } : current);
        setSavedSignature(builderProjectSignature({
          name: response.project.name,
          description: response.project.description,
          appType: response.project.appType,
          template: response.project.template,
          files: response.project.files,
        }));
        await invalidateProjects(project.id);
      } else if (isSignedIn) {
        const input: TinanaiBuilderProjectInput = {
          name, description: descriptionDraft.slice(0, 1000), appType: appTypeDraft, framework: 'static_html',
          template: project.template, files,
        };
        const response = await createProject.mutateAsync({ data: input });
        setProject({ ...response.project, id: response.project.id, source: 'server' });
        setSavedSignature(builderProjectSignature({
          name: response.project.name,
          description: response.project.description,
          appType: response.project.appType,
          template: response.project.template,
          files: response.project.files,
        }));
        await invalidateProjects(response.project.id);
      } else {
        const id = project.id ?? uid();
        const old = localProjects.find((item) => item.id === id);
        const previousFiles = old ? old.files?.length ? old.files : [{ path: 'index.html', content: old.html, mediaType: 'text/html' }] : null;
        const previousBytes = previousFiles?.reduce((total, file) => total + new TextEncoder().encode(file.content).length, 0) ?? Infinity;
        const snapshot = old && previousFiles && previousBytes <= 200_000
          ? [{ id: uid(), summary: old.name, files: previousFiles, createdAt: now() }]
          : [];
        const localProject = {
          id, name, description: descriptionDraft.slice(0, 1000), html: '', files, versions: snapshot,
          appType: appTypeDraft, template: project.template,
          previewStatus, buildStatus: build.status, buildDetails: build.details || null, buildAt: build.at,
          testStatus: smoke.status, testDetails: smoke.details || null, testAt: smoke.at,
          createdAt: old?.createdAt ?? now(), updatedAt: now(),
        };
        const nextLocalProjects = [localProject, ...localProjects.filter((item) => item.id !== id)];
        const estimatedWorkspaceBytes = new TextEncoder().encode(JSON.stringify({ ...workspace, projects: nextLocalProjects })).length;
        if (estimatedWorkspaceBytes > 1_500_000) {
          throw new Error('Browser storage is full for this project. Sign in to save it to your account, or export a ZIP and remove unused local projects.');
        }
        upsert('projects', localProject);
        setProject((current) => current ? { ...current, id, name, description: descriptionDraft, source: 'local' } : current);
        setSavedSignature(builderProjectSignature({
          name: localProject.name,
          description: localProject.description,
          appType: localProject.appType,
          template: localProject.template,
          files: localProject.files,
        }));
      }
      toast({ title: 'Project saved', description: isSignedIn ? 'Available in your account workspace.' : 'Saved only in this browser workspace.' });
    } catch (saveError) {
      setError(`Could not save this project: ${errMsg(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const runStaticChecks = async () => {
    if (!project) return;
    const timestamp = now();
    const problems: string[] = [];
    const blocked: string[] = [];
    let totalBytes = 0;
    if (!project.files.some((file) => file.path === 'index.html')) problems.push('index.html is missing.');
    if (!project.files.every((file) => isSafeBuilderFilePath(file.path))) problems.push('One or more file paths are unsafe.');
    if (project.files.length > FILE_LIMIT) problems.push(`Project exceeds the ${FILE_LIMIT}-file limit.`);
    for (const file of project.files) {
      const fileBytes = new TextEncoder().encode(file.content).length;
      totalBytes += fileBytes;
      if (fileBytes > 2_000_000) problems.push(`${file.path} exceeds the 2 MB source limit.`);
      if (!/\.(html?|css|m?js)$/i.test(file.path)) blocked.push(`${file.path} is retained as source but not executed in the preview.`);
      if (/\.m?js$/i.test(file.path) && !safeScript(file.content)) blocked.push(`${file.path} was blocked from preview because it uses unsupported browser APIs or dynamic execution.`);
    }
    const htmlFiles = project.files.filter((file) => /\.html?$/i.test(file.path));
    for (const page of htmlFiles) {
      for (const match of page.content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        if (!safeScript(match[1] ?? '')) {
          blocked.push(`${page.path}: inline script blocked because it uses unsupported browser APIs or dynamic execution.`);
        }
      }
      const refs = [...page.content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
      for (const reference of refs) {
        if (reference.startsWith('#')) continue;
        if (/^(?:[a-z]+:|\/\/|data:|blob:|javascript:)/i.test(reference)) {
          blocked.push(`${page.path}: external or active reference blocked from preview: ${reference}`);
          continue;
        }
        const localPath = resolveLocalProjectPath(page.path, reference);
        if (localPath === null) {
          blocked.push(`${page.path}: reference blocked from preview: ${reference}`);
          continue;
        }
        const sourcePath = reference.split(/[?#]/, 1)[0] ?? '';
        if (/\.html?$/i.test(sourcePath) || !/\.[a-z0-9]+$/i.test(sourcePath)) {
          if (!resolvePreviewPage(project.files, page.path, reference)) {
            problems.push(`${page.path}: local page not found: ${reference}`);
          }
        } else if (/\.(?:css|m?js)$/i.test(sourcePath)) {
          if (!project.files.some((file) => file.path === localPath)) problems.push(`${page.path}: local reference not found: ${reference}`);
        } else {
          blocked.push(`${page.path}: local asset type is not served by the static preview: ${reference}`);
        }
      }
    }
    if (totalBytes > 2_000_000) problems.push('Combined project source exceeds the 2 MB storage limit.');
    const details = [
      problems.length ? `Failed checks: ${problems.join(' ')}` : 'Passed: entry file, relative paths, source-size limits, and local references checked.',
      blocked.length ? `Blocked / not previewed: ${blocked.join(' ')}` : '',
      'This is a browser-side static source check, not a production build.',
    ].filter(Boolean).join('\n');
    const nextBuild: Checks = { status: problems.length ? 'failed' : 'passed', details, at: timestamp };
    setBuild(nextBuild);
    if (project.source === 'local') {
      persistLocalMetadata({ buildStatus: nextBuild.status, buildDetails: details, buildAt: timestamp });
    }
    if (project.source === 'server' && project.id) {
      try {
        await updateProject.mutateAsync({ id: project.id, data: { buildStatus: nextBuild.status, buildDetails: details.slice(0, 4000), buildAt: timestamp } });
        await invalidateProjects(project.id);
      } catch (saveError) { setError(`Checks ran locally, but their status could not be saved: ${errMsg(saveError)}`); }
    }
  };

  const runSmokeTest = () => {
    if (!project || !project.files.some((file) => file.path === 'index.html')) {
      setSmoke({ status: 'blocked', details: 'Smoke test blocked: index.html is required.', at: now() });
      return;
    }
    setFrameLogs([]);
    setChecking(true);
    setSmoke({ status: 'not_run', details: 'Waiting for isolated preview to load…', at: null });
    resetPreview();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setChecking(false);
      const blocked: Checks = {
        status: 'blocked', at: now(),
        details: 'No preview-ready signal arrived before timeout. The smoke test is blocked; inspect the preview tab and retry.',
      };
      setSmoke((old) => old.status === 'failed' ? old : blocked);
      if (project.source === 'server' && project.id) {
        void updateProject.mutateAsync({ id: project.id, data: { testStatus: 'blocked', testDetails: blocked.details, testAt: blocked.at } })
          .then(() => invalidateProjects(project.id as string))
          .catch((saveError: unknown) => setError(`Smoke test was blocked, and its status could not be saved: ${errMsg(saveError)}`));
      } else if (project.source === 'local') {
        persistLocalMetadata({ testStatus: blocked.status, testDetails: blocked.details, testAt: blocked.at });
      }
    }, 7000);
  };

  useEffect(() => {
    if (smoke.details === 'Preview loaded' && checking) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const timestamp = now();
        const errors = frameLogs.filter((log) => log.startsWith('Error:'));
        const passed = errors.length === 0;
        const details = passed
          ? 'Passed: the isolated page loaded and no runtime error was captured during the initial check. This is not an exhaustive test.'
          : `Failed: runtime error captured. ${errors.join(' ')}`;
        const next = { status: passed ? 'passed' as const : 'failed' as const, details, at: timestamp };
        setSmoke(next);
        setChecking(false);
        if (project?.source === 'local') {
          persistLocalMetadata({ testStatus: next.status, testDetails: details.slice(0, 4000), testAt: timestamp });
        }
        if (project?.source === 'server' && project.id) {
          const savedId = project.id;
          void updateProject.mutateAsync({ id: savedId, data: { testStatus: next.status, testDetails: details.slice(0, 4000), testAt: timestamp } })
            .then(() => invalidateProjects(savedId))
            .catch((saveError: unknown) => setError(`Smoke test ran locally, but its status could not be saved: ${errMsg(saveError)}`));
        }
      }, 450);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    return undefined;
  }, [smoke.details, checking, frameLogs, project?.id, project?.source]);

  const onFileUpload = async (fileList: FileList | null) => {
    if (!fileList || !project) return;
    const next = [...project.files];
    let message = '';
    for (const file of Array.from(fileList)) {
      if (next.length >= FILE_LIMIT) break;
      const path = file.name.replace(/[\\]/g, '/').split('/').pop() ?? file.name;
      if (!/\.(?:html?|css|m?js|txt|md|json)$/i.test(path)) { message = `${path}: unsupported source-file format.`; continue; }
      if (next.some((item) => item.path === path)) { message = `${path}: a file with this name already exists.`; continue; }
      const content = await file.text();
      if (new TextEncoder().encode(content).length > 2_000_000) { message = `${path}: source files are limited to 2 MB.`; continue; }
      next.push({ path, content, mediaType: mediaType(path) });
    }
    setFiles(next);
    if (message) setError(message);
  };

  const addUploads = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = [...uploads];
    let message = '';
    for (const file of Array.from(fileList)) {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!UPLOAD_EXTENSIONS.has(extension)) { message = `${file.name}: unsupported upload format.`; continue; }
      if (file.size > 20 * 1024 * 1024) { message = `${file.name}: files must be 20 MB or smaller.`; continue; }
      if (accepted.length >= FILE_LIMIT) { message = `Choose no more than ${FILE_LIMIT} files.`; break; }
      if (accepted.reduce((total, item) => total + item.size, 0) + file.size > 50 * 1024 * 1024) { message = 'The total upload cannot exceed 50 MB.'; continue; }
      accepted.push(file);
    }
    setUploads(accepted);
    if (message) setError(message);
  };

  const addFile = () => {
    const path = window.prompt('New file path (for example: styles.css)');
    if (!path?.trim() || !project) return;
    const clean = path.trim();
    if (!isSafeBuilderFilePath(clean) || project.files.some((file) => file.path === clean) || project.files.length >= FILE_LIMIT) {
      setError('Choose a unique, safe relative path and stay within the file limit.');
      return;
    }
    setFiles([...project.files, { path: clean, content: '', mediaType: mediaType(clean) }]);
    setActivePath(clean);
  };

  const renameActiveFile = () => {
    if (!project || !activeFile) return;
    const nextPath = window.prompt('Rename source file', activeFile.path);
    if (nextPath === null || nextPath === activeFile.path) return;
    const renamed = renameBuilderFile(project.files, activeFile.path, nextPath.trim());
    if (!renamed.ok) {
      const messages = {
        'missing-file': 'That source file no longer exists.',
        'entry-file': 'The required index.html entry file cannot be renamed.',
        'unsafe-path': 'Choose a safe relative path without traversal or reserved folders.',
        'duplicate-path': 'A source file already uses that path.',
      } as const;
      setError(messages[renamed.reason]);
      return;
    }
    setFiles(renamed.files.map((file) => file.path === renamed.path
      ? { ...file, mediaType: mediaType(renamed.path) }
      : file));
    setActivePath(renamed.path);
    toast({ title: 'File renamed', description: 'Review local links that refer to its previous path.' });
  };

  const findNextInEditor = () => {
    if (!activeFile || !findTerm) return;
    const editor = editorRef.current;
    const selectionStart = editor?.selectionEnd ?? 0;
    const found = activeFile.content.indexOf(findTerm, selectionStart);
    const nextIndex = found === -1 ? activeFile.content.indexOf(findTerm) : found;
    if (nextIndex < 0) return;
    editor?.focus();
    editor?.setSelectionRange(nextIndex, nextIndex + findTerm.length);
  };

  const replaceAllInEditor = () => {
    if (!project || !activeFile || !findTerm || matchCount === 0) return;
    const nextContent = replaceLiteral(activeFile.content, findTerm, replaceTerm);
    setFiles(project.files.map((file) => file.path === activeFile.path ? { ...file, content: nextContent } : file));
  };

  const removeProject = async (summary: TinanaiBuilderProjectSummary) => {
    if (!window.confirm(translateTemplate('Delete project {name} and its version history? This cannot be undone.', locale, { name: summary.name }))) return;
    try {
      if (isSignedIn) {
        await deleteProject.mutateAsync({ id: summary.id });
        await invalidateProjects(summary.id);
      } else remove('projects', summary.id);
      if (project?.id === summary.id) setProject(null);
      if (project?.id === summary.id) setSavedSignature(null);
      toast({ title: 'Project deleted' });
    } catch (deleteError) { setError(`Could not delete project: ${errMsg(deleteError)}`); }
  };

  const duplicate = async (summary: TinanaiBuilderProjectSummary) => {
    try {
      if (isSignedIn) {
        const response = await duplicateProject.mutateAsync({ id: summary.id });
        await invalidateProjects(response.project.id);
        toast({ title: 'Project duplicated' });
      } else {
        const original = localProjects.find((item) => item.id === summary.id);
        if (!original) return;
        const id = uid();
        const copy = { ...original, id, name: `${original.name} copy`, html: original.files?.length ? '' : original.html, createdAt: now(), updatedAt: now(), versions: [] };
        const nextLocalProjects = [copy, ...localProjects.filter((item) => item.id !== id)];
        if (new TextEncoder().encode(JSON.stringify({ ...workspace, projects: nextLocalProjects })).length > 1_500_000) {
          setError('Browser storage is full. Export or remove local projects before duplicating this one.');
          return;
        }
        upsert('projects', copy);
        toast({ title: 'Project duplicated locally' });
      }
    } catch (duplicateError) { setError(`Could not duplicate project: ${errMsg(duplicateError)}`); }
  };

  const restore = async (version: TinanaiBuilderProjectVersion | NonNullable<typeof localProjects[number]['versions']>[number]) => {
    if (!project) return;
    if (!window.confirm(translateTemplate('Restore version {version}? Current unsaved edits will be replaced.', locale, { version: 'version' in version ? version.version : 'snapshot' }))) return;
    try {
      if (project.source === 'server' && project.id && 'version' in version) {
        const response = await restoreVersion.mutateAsync({ id: project.id, version: version.version });
        setProject({ ...response.project, source: 'server' });
        setSavedSignature(builderProjectSignature({
          name: response.project.name,
          description: response.project.description,
          appType: response.project.appType,
          template: response.project.template,
          files: response.project.files,
        }));
        setBuild({ status: 'not_run', details: '', at: null });
        setSmoke({ status: 'not_run', details: '', at: null });
        resetPreview();
        await invalidateProjects(project.id);
      } else {
        const local = localProjects.find((item) => item.id === project.id);
        if (!local || !('files' in version)) return;
        const previousFiles = local.files?.length ? local.files : [{ path: 'index.html', content: local.html, mediaType: 'text/html' }];
        const previousBytes = previousFiles.reduce((total, file) => total + new TextEncoder().encode(file.content).length, 0);
        const snapshots = previousBytes <= 200_000 ? [{ id: uid(), summary: local.name, files: previousFiles, createdAt: now() }] : [];
        const restoredProject = { ...local, html: '', files: version.files, versions: snapshots, updatedAt: now() };
        const nextLocalProjects = [restoredProject, ...localProjects.filter((item) => item.id !== local.id)];
        if (new TextEncoder().encode(JSON.stringify({ ...workspace, projects: nextLocalProjects })).length > 1_500_000) {
          setError('Browser storage is full. Export or remove local projects before restoring this snapshot.');
          return;
        }
        upsert('projects', restoredProject);
        setProject((current) => current ? { ...current, files: version.files } : current);
        setSavedSignature(builderProjectSignature({
          name: restoredProject.name,
          description: restoredProject.description,
          appType: restoredProject.appType ?? 'web_app',
          template: restoredProject.template ?? 'ai_generated',
          files: version.files,
        }));
        setBuild({ status: 'not_run', details: '', at: null });
        setSmoke({ status: 'not_run', details: '', at: null });
        setActivePath(version.files.some((file) => file.path === activePath) ? activePath : version.files[0]?.path ?? 'index.html');
        resetPreview();
      }
      setHistoryOpen(false);
      toast({ title: 'Version restored' });
    } catch (restoreError) { setError(`Could not restore this version: ${errMsg(restoreError)}`); }
  };

  const exportProject = () => {
    if (!project) return;
    const readme = redactSecrets(`# ${currentProjectName}\n\n${currentDescription}\n\n## Runtime support\n\nThis export is a static HTML/CSS/JavaScript project. Only index.html and safe local CSS/JavaScript are previewed in TINANAI. React, TypeScript, npm packages, server code, and backend execution are not supported.\n\n## Safety\n\nThe TINANAI preview uses a sandboxed iframe without allow-same-origin and a restrictive Content Security Policy. Network API calls and external assets are blocked; preview content does not receive TINANAI secrets, filesystem, or environment access. Browser sandboxing is not a process or resource boundary: navigation behavior varies by browser, and CPU or memory quotas are not enforced, so a runaway script can stall the preview tab. Secret-like values are redacted from exported source; review and replace placeholders before use elsewhere.\n\nStatic checks and the basic smoke test are limited browser checks, not a production build or exhaustive test suite.\n`);
    const entries: Record<string, Uint8Array> = { 'README.md': new TextEncoder().encode(readme) };
    for (const file of project.files) if (isSafeBuilderFilePath(file.path)) entries[file.path] = new TextEncoder().encode(redactSecrets(file.content));
    downloadBytes(`${currentProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'tinanai-project'}.zip`, zipSync(entries, { level: 6 }), 'application/zip');
  };

  const downloadReport = () => {
    const report = {
      project: currentProjectName, generatedAt: now(), scope: 'Browser-side static checks and a basic iframe load/runtime-error smoke check; not a production build or exhaustive test.',
      staticChecks: build, smokeTest: smoke, runtimeConsole: frameLogs,
    };
    download(`${(currentProjectName || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-test-report.json`, redactSecrets(JSON.stringify(report, null, 2)), 'application/json');
  };

  if (previewProjectId) {
    const previewProject = project?.id === previewProjectId ? project : null;
    const entryPages = previewProject?.files.filter((file) => /\.html?$/i.test(file.path)).map((file) => file.path) ?? [];
    const activePage = entryPages.includes(previewEntryPath) ? previewEntryPath : entryPages[0] ?? '';
    const loading = !previewRouteError && (
      !isLoaded ||
      (isSignedIn && listQuery.isLoading) ||
      !previewProject ||
      (previewProject.source === 'server' && detailQuery.isLoading)
    );
    const emptyDiagnostic: Checks = {
      status: previewRouteError ? 'blocked' : 'not_run',
      details: previewRouteError || (loading ? 'Loading the latest saved project version.' : ''),
      at: null,
    };
    const versionLabel = previewProject?.summary?.version
      ? `Saved version ${previewProject.summary.version}`
      : previewProject?.source === 'local'
        ? 'Latest browser-local save'
        : 'Saved project';

    return (
      <LocalizedTree>
        <BuilderPreviewScreen
          projectName={previewProject?.name ?? (previewRouteError ? 'Project unavailable' : 'Loading project…')}
          versionLabel={versionLabel}
          entryPages={entryPages}
          activePage={activePage}
          previewStatus={previewProject ? previewStatus : 'not_run'}
          build={previewProject ? build : emptyDiagnostic}
          smoke={previewProject ? smoke : emptyDiagnostic}
          checking={checking}
          loading={loading}
          loadError={previewRouteError}
          frameLogs={previewProject ? frameLogs : []}
          previewSrc={previewProject ? fullPreviewSrc : ''}
          frameRef={frameRef}
          onFrameLoad={handlePreviewLoad}
          onBackToProject={closeProjectPreview}
          onOpenInEditor={() => {
            if (activePage) setActivePath(activePage);
            openProjectEditor();
          }}
          onRefresh={refreshFullPreview}
          onOpenInNewWindow={openPreviewInNewWindow}
          onToggleFullscreen={togglePreviewFullscreen}
          onSelectPage={(path) => {
            if (!entryPages.includes(path)) return;
            updatePreviewPageUrl(path);
            setPreviewEntryPath(path);
            resetPreview();
          }}
          onRunStaticChecks={() => void runStaticChecks()}
          onRunSmokeTest={runSmokeTest}
        />
      </LocalizedTree>
    );
  }

  return (
    <LocalizedTree>
    <div className="space-y-5 pb-6" data-testid="page-builder">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-primary/15 bg-[linear-gradient(120deg,hsl(var(--card))_0%,hsl(var(--background))_78%)] p-5 shadow-[0_18px_48px_rgba(2,8,23,.18)] sm:flex-row sm:items-center sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/[.08] text-primary"><Code2 className="h-4 w-4" aria-hidden="true" /></span>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">TINANAI · Project Builder</p>
          </div>
          <h1 className="mt-3 truncate text-2xl font-bold tracking-tight sm:text-3xl">{project ? currentProjectName : 'From prompt to working source.'}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
            {project ? 'Edit source files, request AI changes for review, inspect a static preview, and save when ready.' : 'Generate, inspect, edit and test small static apps without losing track of the files or the preview limits.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground">Static HTML · CSS · JS</span>
          <span className="rounded-full border border-primary/20 bg-primary/[.06] px-3 py-1.5 text-[10px] font-semibold text-primary">Sandboxed preview</span>
          {project && <span aria-live="polite" className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${isDirty ? 'border-amber-300/25 bg-amber-300/[.06] text-amber-100' : 'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-100'}`}>
            {project.source === 'draft' ? 'Not saved yet' : savedSignature === null ? 'Loading saved state…' : isDirty ? 'Unsaved changes' : 'Saved'}
          </span>}
        </div>
      </header>
      {project && (
        <BuilderAgentPanel
          key={`${userId ?? 'anonymous'}:${project.id ?? 'local'}`}
          projectId={serverId}
          projectName={currentProjectName}
          hasUnsavedChanges={isDirty}
        />
      )}
      {project && (
        <BuilderAiImprovementPanel
          key={`ai-edit:${userId ?? 'anonymous'}:${project.id ?? project.source}`}
          projectName={currentProjectName}
          prompt={improvementPrompt}
          onPromptChange={setImprovementPrompt}
          busy={generation.isPending}
          error={improvementError}
          proposal={aiProposal}
          proposalIsStale={aiProposalIsStale}
          onRequest={() => void improveWithAi()}
          onApply={applyAiProposal}
          onDiscard={discardAiProposal}
          onDownload={downloadAiProposal}
        />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(270px,320px)_minmax(0,1fr)] 2xl:gap-5">
        <aside className="space-y-4">
          <Card className="space-y-4" data-testid="panel-builder-input">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Start a session</h2>
              <span className="rounded-full border border-primary/25 bg-primary/[.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                {isLoaded ? isSignedIn ? 'Account workspace' : 'This browser' : 'Checking account'}
              </span>
            </div>
            <Field label="Output type">
              <Select value={outputType} onChange={(event) => setOutputType(event.target.value as TinanaiBuilderResponse['outputType'])} data-testid="select-output-type">
                <option value="app">Static app</option><option value="token">Token (ERC-20)</option><option value="analytics">Analytics</option><option value="json">JSON</option>
              </Select>
            </Field>
            {outputType === 'app' && <>
              <Field label="Application type">
                <Select value={generationAppType} onChange={(event) => setGenerationAppType(event.target.value as AppType)} data-testid="select-builder-app-type">
                  {APP_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Design direction">
                <Select value={designDirection} onChange={(event) => setDesignDirection(event.target.value as BuilderDesignDirection)} data-testid="select-builder-design">
                  {APP_DESIGN_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <p className="text-[10px] leading-5 text-muted-foreground">The selected type guides the first working workflow and project metadata. Preview supports static HTML, CSS, and JavaScript only.</p>
            </>}
            <Field label="Describe the work" hint={`${prompt.length.toLocaleString(locale)} / ${promptLimit.toLocaleString(locale)}`}>
              <Textarea rows={5} maxLength={promptLimit} value={prompt} onChange={(event) => setPrompt(event.target.value)} data-testid="input-builder-prompt"
                placeholder={outputType === 'app' ? 'Describe the audience, key screens, and the main action users should complete.' : outputType === 'analytics' ? 'Ask a question about uploaded data.' : outputType === 'token' ? 'Describe a token draft and its parameters.' : 'Describe the JSON structure and validation rules.'} />
            </Field>
            <input ref={inputRef} type="file" hidden multiple accept={[...UPLOAD_EXTENSIONS].join(',')} onChange={(event) => { addUploads(event.target.files); event.currentTarget.value = ''; }} data-testid="input-builder-files" />
            <div
              className={`rounded-xl border border-dashed p-3 transition ${draggingUploads ? 'border-primary bg-primary/[.08]' : 'border-border bg-background/35'}`}
              role="group"
              aria-label="Add files to Builder"
              onDragOver={(event) => { event.preventDefault(); setDraggingUploads(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingUploads(false); }}
              onDrop={(event) => { event.preventDefault(); setDraggingUploads(false); addUploads(event.dataTransfer.files); }}
            >
              <div className="flex items-center gap-3">
                <CloudUpload className="h-5 w-5 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">Drop files or choose. Request-only; scripts are never run.</p>
                <Btn size="sm" onClick={() => inputRef.current?.click()}><Plus className="h-3.5 w-3.5" /> Add files</Btn>
              </div>
              {uploads.length > 0 && <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">{uploads.map((file, index) => <li key={`${file.name}-${index}`} className="flex justify-between gap-2"><span className="truncate">{file.name}</span><button type="button" onClick={() => setUploads((items) => items.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
            </div>
            <p className="text-[10px] leading-5 text-muted-foreground">Uploads are request-only; scripts are never run. Do not upload credentials or wallet keys. App generation uses the configured OpenAI integration and may consume Replit AI credits. Generated apps are static HTML/CSS/JavaScript, not React or backend services.</p>
            <Btn variant="gold" className="w-full" onClick={generate} disabled={generation.isPending || !prompt.trim() || prompt.trim().length > promptLimit} data-testid="button-generate">
              {generation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generation.isPending ? 'Generating…' : outputType === 'app' ? 'Generate static app' : `Generate ${outputType}`}
            </Btn>
            {generation.isPending && <p role="status" className="text-center text-xs text-muted-foreground">Inspecting supported uploads and preparing the requested output…</p>}
            {error && <ErrorNote message={error} onRetry={generation.error ? generate : undefined} />}
            {error && outputType === 'app' && <div className="rounded-lg border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100"><p>No app was generated. Retry or use a deterministic local template; templates are not AI output.</p><Btn size="sm" className="mt-2" onClick={() => { setTemplateDraft('task_manager'); setCreateOpen(true); }}>Use task manager starter</Btn></div>}
          </Card>

          <Card className="space-y-3" data-testid="panel-projects">
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Workspace</p><h2 className="mt-1 font-semibold">Projects <span className="font-mono text-xs text-muted-foreground">{projectList.length}</span></h2></div>
              <Btn size="sm" onClick={() => { setNameDraft(''); setDescriptionDraft(''); setAppTypeDraft('web_app'); setTemplateDraft('blank'); setCreateOpen(true); }}><Plus className="h-4 w-4" /> New</Btn>
            </div>
            {!isLoaded ? <div className="space-y-2" aria-label="Loading projects"><div className="knowledge-skeleton h-16 rounded-lg" /><div className="knowledge-skeleton h-16 rounded-lg" /></div>
              : isSignedIn && listQuery.isLoading ? <div className="knowledge-skeleton h-20 rounded-lg" aria-label="Loading account projects" />
                : isSignedIn && listQuery.isError ? <div className="rounded-lg border border-destructive/25 p-3 text-xs text-muted-foreground">Your account projects could not be loaded. <button type="button" className="text-primary underline" onClick={() => void listQuery.refetch()}>Retry</button></div>
                  : projectList.length === 0 ? <div className="rounded-xl border border-dashed border-border p-4 text-center"><Code2 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No saved projects yet</p><p className="mt-1 text-xs text-muted-foreground">Create a local starter or save generated source.</p></div>
                    : <div className="max-h-[370px] space-y-2 overflow-auto pr-1">{projectList.map((item) => <article key={item.id} className={`rounded-lg border p-3 transition ${project?.id === item.id ? 'border-primary/40 bg-primary/[.05]' : 'border-border bg-background/25'}`} data-testid={`card-project-${item.id}`}>
                      <button type="button" className="w-full text-left" onClick={() => void chooseProject(item)} data-testid={`button-open-project-${item.id}`}>
                        <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.name}</strong><StatusPill status={item.previewStatus} /></span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.description || 'Static HTML · CSS · JavaScript'}</span>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">{isSignedIn ? 'Account-owned' : 'Browser-local'} · {readable(item.updatedAt)}</span>
                        <div className="flex gap-1">
                          <button type="button" title="Preview project" aria-label={`Preview ${item.name}`} data-testid={`button-preview-project-${item.id}`} onClick={() => void openProjectPreview(item)} className="rounded p-1.5 text-primary hover:bg-primary/10"><Monitor className="h-3.5 w-3.5" /></button>
                          <button type="button" title="Duplicate project" aria-label={`Duplicate ${item.name}`} onClick={() => void duplicate(item)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                          <button type="button" title="Delete project" aria-label={`Delete ${item.name}`} onClick={() => void removeProject(item)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </article>)}</div>}
            <p className="text-[10px] leading-4 text-muted-foreground">{isSignedIn ? 'Only projects owned by your signed-in account are shown.' : 'Projects in this mode remain in this browser Workspace store and are not synced.'}</p>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4">
          {outputType !== 'app' && result && <BuilderOutput result={result} />}
          {outputType === 'app' && !project && result?.outputType === 'app' && <Card className="p-0"><BuilderOutput result={result} /></Card>}
          {project?.source === 'server' && detailQuery.isLoading && !project.files.length
            ? <Card className="space-y-3" aria-label="Loading project source"><div className="knowledge-skeleton h-8 rounded" /><div className="knowledge-skeleton h-72 rounded" /></Card>
            : project?.source === 'server' && detailQuery.isError && !project.files.length
              ? <Card className="space-y-3"><p className="font-semibold">Project source could not be opened.</p><p className="text-sm text-muted-foreground">Your account-owned project remains unchanged.</p><Btn size="sm" onClick={() => void detailQuery.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Retry</Btn></Card>
              : project ? <>
            <Card className="overflow-hidden p-0" data-testid="panel-project-editor">
              <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Code2 className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><Input className="h-8 border-transparent bg-transparent px-1 text-base font-semibold focus-visible:border-input" aria-label="Project name" value={nameDraft} maxLength={80} onChange={(event) => { setNameDraft(event.target.value); setProject((current) => current ? { ...current, name: event.target.value } : current); }} data-testid="input-project-name" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[10px] text-muted-foreground">
                        <span>{project.source === 'server' ? 'Account-owned project' : project.source === 'local' ? 'Browser-local project' : project.template === 'ai_generated' ? 'AI-generated source · editable' : 'Deterministic local template'}</span>
                        <span aria-live="polite" className={isDirty ? 'font-semibold text-amber-200' : 'text-emerald-200'}>
                          {project.source === 'draft' ? 'Not saved yet' : savedSignature === null ? 'Loading saved state…' : isDirty ? 'Unsaved changes' : 'Saved'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <Btn size="sm" onClick={() => setHistoryOpen(true)} disabled={!project.id}><History className="h-4 w-4" /> Versions</Btn>
                <Btn size="sm" onClick={exportProject}><Package className="h-4 w-4" /> Export ZIP</Btn>
                <Btn size="sm" variant="gold" onClick={() => void save()} disabled={saving || !isLoaded}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</Btn>
              </div>
              <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="border-b border-border bg-background/25 p-3 lg:border-b-0 lg:border-r">
                  <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Source files</span><button type="button" onClick={addFile} title="Add file" aria-label="Add source file" className="rounded-md p-1.5 text-primary hover:bg-primary/10"><FilePlus2 className="h-4 w-4" /></button></div>
                  <Input type="search" aria-label="Search source files" placeholder="Filter files…" value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} className="mb-3 h-8 text-xs" />
                  <div className="space-y-1">{visibleFiles.map((file) => <button type="button" key={file.path} onClick={() => setActivePath(file.path)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${activeFile?.path === file.path ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}><FileCode2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.path}</span></button>)}</div>
                  {visibleFiles.length === 0 && <p className="py-2 text-xs text-muted-foreground">No files match this search.</p>}
                  <button type="button" onClick={() => sourceInputRef.current?.click()} className="mt-3 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground hover:text-foreground"><CloudUpload className="h-3.5 w-3.5" /> Import source files</button>
                  <input ref={sourceInputRef} type="file" hidden multiple accept=".html,.htm,.css,.js,.mjs,.txt,.md,.json" onChange={(event) => { void onFileUpload(event.target.files); event.currentTarget.value = ''; }} />
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    <Field label="App category"><Select value={appTypeDraft} onChange={(event) => setAppTypeDraft(event.target.value as AppType)}>{APP_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                    <Field label="Project description"><Textarea rows={2} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} maxLength={1000} placeholder="What is this project for?" /></Field>
                    <Field label="Source template"><Select value={project.template} disabled><option value="ai_generated">AI-generated source</option><option value="blank">Blank static</option><option value="task_manager">Task manager template</option><option value="dashboard">Dashboard template</option></Select></Field>
                    <Field label="Framework"><Select value="static_html" disabled aria-label="Supported framework"><option value="static_html">Static HTML / CSS / JS</option></Select></Field>
                  </div>
                </div>
                <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-background/60 px-3 py-2">
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{activeFile?.path ?? 'No file selected'}</span>
                      <div className="flex gap-1">
                        {activeFile && <button type="button" title="Find and replace" aria-label="Find and replace in current file" aria-expanded={findReplaceOpen} onClick={() => setFindReplaceOpen((open) => !open)} className="rounded p-1.5 text-muted-foreground hover:text-primary"><Replace className="h-3.5 w-3.5" /></button>}
                        {activeFile && <button type="button" title={activeFile.path === 'index.html' ? 'The required entry file cannot be renamed' : 'Rename file'} aria-label="Rename source file" disabled={activeFile.path === 'index.html'} onClick={renameActiveFile} className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30"><Pencil className="h-3.5 w-3.5" /></button>}
                        {activeFile && <button type="button" title="Download file" onClick={() => download(fileName(activeFile.path), redactSecrets(activeFile.content), activeFile.mediaType)} className="rounded p-1.5 text-muted-foreground hover:text-primary"><Download className="h-3.5 w-3.5" /></button>}
                        <button type="button" title="Remove file" aria-label={`Delete ${activeFile?.path ?? 'source file'}`} disabled={!activeFile || activeFile.path === 'index.html'} onClick={() => { if (activeFile && window.confirm(`Delete ${activeFile.path}? This cannot be undone.`)) { setFiles(project.files.filter((file) => file.path !== activeFile.path)); setActivePath('index.html'); } }} className="rounded p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  {findReplaceOpen && activeFile && <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/50 p-3" role="group" aria-label="Find and replace">
                    <Input aria-label="Find text in current file" placeholder="Find" value={findTerm} onChange={(event) => setFindTerm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findNextInEditor(); } }} className="h-8 min-w-32 flex-1 text-xs" />
                    <Input aria-label="Replace text in current file" placeholder="Replace with" value={replaceTerm} onChange={(event) => setReplaceTerm(event.target.value)} className="h-8 min-w-32 flex-1 text-xs" />
                    <span className="min-w-16 text-center text-[10px] text-muted-foreground" aria-live="polite">{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>
                    <Btn size="sm" variant="outline" onClick={findNextInEditor} disabled={!findTerm || matchCount === 0}>Find next</Btn>
                    <Btn size="sm" variant="outline" onClick={replaceAllInEditor} disabled={!findTerm || matchCount === 0}>Replace all</Btn>
                  </div>}
                  <textarea ref={editorRef} aria-label={`Edit ${activeFile?.path ?? 'source file'}`} value={activeFile?.content ?? ''} onChange={(event) => activeFile && setFiles(project.files.map((file) => file.path === activeFile.path ? { ...file, content: event.target.value } : file))} spellCheck={false} className="min-h-[330px] w-full resize-y rounded-none border-0 bg-background/90 p-4 font-mono text-xs leading-6 text-foreground outline-none" data-testid="input-source-editor" />
                </div>
              </div>
            </Card>
            {result?.outputType === 'app' && project.template === 'ai_generated' && <Card className="space-y-3 border-primary/20 bg-primary/[.025]">
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Generation notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{result.summary}</p></div>
              {result.warnings.length > 0 && <ul className="space-y-1 rounded-lg border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
              {result.uploads.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-semibold text-muted-foreground">Inspected uploads ({result.uploads.length})</summary><ul className="mt-2 max-h-32 space-y-1 overflow-auto text-muted-foreground">{result.uploads.map((file, index) => <li key={`${index}-${file.name}`} className="flex justify-between gap-2"><span className="truncate">{file.name} · {file.format}</span><span className="shrink-0">{file.size.toLocaleString(locale)} bytes{file.truncated ? ' · excerpt limited' : ''}</span></li>)}</ul></details>}
            </Card>}

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
              <Card className="overflow-hidden p-0" data-testid="panel-builder-preview">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Isolated preview</h2><StatusPill status={previewStatus} /><span className="rounded-full border border-emerald-300/20 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-200">Sandboxed</span></div>
                  <Btn size="sm" onClick={resetPreview}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Btn>
                </div>
                {project.files.some((file) => file.path === 'index.html')
                  ? <iframe key={frameKey} ref={frameRef} title={`${currentProjectName} isolated preview`} sandbox="allow-scripts allow-forms" srcDoc={previewSrc} onLoad={handlePreviewLoad} className="h-[390px] w-full bg-white" data-testid="iframe-preview" />
                  : <div className="grid h-[390px] place-items-center text-center"><div><AlertTriangle className="mx-auto h-6 w-6 text-amber-200" /><p className="mt-2 text-sm font-semibold">Preview unavailable</p><p className="mt-1 text-xs text-muted-foreground">Add an index.html entry file to continue.</p></div></div>}
                <div className="border-t border-border bg-amber-300/[.045] px-4 py-3 text-[10px] leading-5 text-amber-100/80">
                  Preview runs in an iframe sandbox without <code>allow-same-origin</code> and uses a restrictive CSP. Network API calls and external assets are blocked; no TINANAI secrets, filesystem, or environment access are provided. Only index.html and safe local CSS/JS are previewed. Browser sandboxing is not a process boundary: navigation behavior varies by browser, and CPU or memory quotas are not enforced, so a runaway script can stall this tab.
                </div>
              </Card>
              <Card className="space-y-4" data-testid="panel-checks">
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Confidence, with limits</p><h2 className="mt-1 font-semibold">Check the source</h2></div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-background/25 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Static checks</span><StatusPill status={build.status} /></div>
                    <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">{build.details || 'Checks entry file, safe paths, file size and local references.'}</p>
                    <Btn size="sm" className="mt-3 w-full" onClick={() => void runStaticChecks()}><ShieldCheck className="h-3.5 w-3.5" /> Run static checks</Btn>
                  </div>
                  <div className="rounded-lg border border-border bg-background/25 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Basic smoke test</span><StatusPill status={smoke.status} /></div>
                    <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">{smoke.details || 'Checks initial iframe load and captures runtime errors; not exhaustive.'}</p>
                    <Btn size="sm" className="mt-3 w-full" onClick={runSmokeTest} disabled={checking}><Play className="h-3.5 w-3.5" />{checking ? 'Waiting for preview…' : 'Run smoke test'}</Btn>
                  </div>
                  <Btn size="sm" variant="outline" className="w-full" onClick={downloadReport}><Download className="h-3.5 w-3.5" /> Download test report</Btn>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/75 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Runtime console</span><span className="font-mono text-[10px] text-muted-foreground">{frameLogs.length}</span></div>
                  <div className="max-h-28 space-y-1 overflow-auto font-mono text-[10px] leading-4">{frameLogs.length ? frameLogs.map((line, index) => <p key={`${index}-${line}`} className={line.startsWith('Error:') ? 'text-rose-200' : 'text-muted-foreground'}>{line}</p>) : <p className="text-muted-foreground">No runtime messages captured.</p>}</div>
                </div>
                <p className="text-[10px] leading-5 text-muted-foreground">Static checks are not a production build. The smoke test covers one initial browser load only. React, TypeScript, npm, network services and backend execution are not supported.</p>
              </Card>
            </div>
          </> : !result && <Card className="knowledge-grid flex min-h-[420px] flex-col items-center justify-center overflow-hidden p-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/[.08] text-primary"><Code2 className="h-5 w-5" /></span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-primary">Static app workspace</p>
            <h2 className="mt-2 max-w-lg font-serif text-3xl">Keep the source in view.</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Generate an app, open a saved project, or start from a deterministic local template. Preview stays isolated from your account data.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2"><Btn onClick={() => { setTemplateDraft('blank'); setNameDraft(''); setDescriptionDraft(''); setCreateOpen(true); }}><Plus className="h-4 w-4" /> Blank project</Btn><Btn variant="outline" onClick={() => { setTemplateDraft('task_manager'); setNameDraft(''); setDescriptionDraft(''); setCreateOpen(true); }}>Task manager template</Btn></div>
          </Card>}
          {outputType === 'app' && result && result.outputType !== 'app' && <BuilderOutput result={result} />}
        </main>
      </div>

      {createOpen && <div className="fixed inset-0 z-[90] grid place-items-center overflow-auto bg-black/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="dialog-new-project"><Card className="w-full max-w-lg space-y-4">
          <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">New project</p><h2 id="dialog-new-project" className="mt-1 font-serif text-2xl">Choose a starting point</h2></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close dialog" className="rounded p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
          <Field label="Name"><Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Untitled project" maxLength={80} /></Field>
          <Field label="Description"><Textarea rows={2} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} maxLength={1000} placeholder="What is this project for?" /></Field>
          <Field label="Project type"><Select value={appTypeDraft} onChange={(event) => setAppTypeDraft(event.target.value as AppType)}>{APP_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Starter template" hint="Templates are deterministic local files, never successful AI output.">
            <Select value={templateDraft} onChange={(event) => setTemplateDraft(event.target.value as Template)}><option value="blank">Blank static project</option><option value="task_manager">Task manager</option><option value="dashboard">Dashboard canvas</option></Select>
          </Field>
          <div className="rounded-lg border border-border bg-background/30 p-3 text-xs leading-5 text-muted-foreground">Supported runtime: static HTML, CSS and JavaScript only. No React, TypeScript, npm or backend execution.</div>
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Btn><Btn variant="gold" onClick={createFromTemplate}><Code2 className="h-4 w-4" /> Create project</Btn></div>
        </Card></div>
      </div>}

      {historyOpen && project && <div className="fixed inset-0 z-[90] grid place-items-center overflow-auto bg-black/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="dialog-version-history"><Card className="w-full max-w-xl space-y-4">
          <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Source history</p><h2 id="dialog-version-history" className="mt-1 font-serif text-2xl">Version snapshots</h2></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close version history" className="rounded p-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
          {project.source === 'server' ? versionsQuery.isLoading ? <div className="knowledge-skeleton h-24 rounded-lg" /> : versionsQuery.isError ? <div className="rounded-lg border border-destructive/20 p-3 text-xs text-muted-foreground">Version history could not be loaded. <button className="text-primary underline" onClick={() => void versionsQuery.refetch()}>Retry</button></div>
            : versionList.length ? <div className="max-h-80 space-y-2 overflow-auto">{versionList.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-semibold">Version {version.version}</p><p className="mt-1 text-xs text-muted-foreground">{version.summary || `${version.files.length} source files`} · {readable(version.createdAt)}</p></div><Btn size="sm" onClick={() => void restore(version)}>Restore</Btn></div>)}</div>
              : <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No saved versions yet. Save edits to create a snapshot.</p>
            : (() => {
              const versions = localProjects.find((item) => item.id === project.id)?.versions ?? [];
               return versions.length ? <div className="max-h-80 space-y-2 overflow-auto">{versions.map((version, index) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-semibold">Local snapshot {versions.length - index}</p><p className="mt-1 text-xs text-muted-foreground">{version.summary} · {readable(version.createdAt)}</p></div><Btn size="sm" onClick={() => void restore(version)}>Restore</Btn></div>)}</div> : <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Browser snapshots are stored only for saved source under 200 KB. Sign in for account-backed version history.</p>;
               })()}
          <p className="text-[10px] leading-5 text-muted-foreground">Restoring replaces the current source. Save snapshots belong to the current account or browser workspace.</p>
          <div className="flex justify-end"><Btn variant="outline" onClick={() => setHistoryOpen(false)}>Close</Btn></div>
        </Card></div>
      </div>}
    </div>
    </LocalizedTree>
  );
}
