import './_group.css';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, Check, ChevronDown, CircleHelp,
  Clock3, Code2, FileCode2, FilePlus2, FolderOpen, GitBranch, History,
  LockKeyhole, Play, RefreshCw, Search, ShieldCheck,
  Terminal, X,
} from 'lucide-react';

type SourceFile = { name: string; language: string; content: string };
type Project = { name: string; detail: string; updated: string };

const initialFiles: SourceFile[] = [
  {
    name: 'index.html',
    language: 'HTML',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Taskflow — Focused work, together</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">t</span> taskflow</div>
        <div class="avatar">JD</div>
      </header>
      <section class="welcome">
        <p class="eyebrow">MONDAY, MAY 19, 2025</p>
        <h1>Good morning, Jamie</h1>
        <p>Here's what's happening with your work today.</p>
      </section>
      <section class="stats">
        <article><span>IN PROGRESS</span><strong>04</strong><small>Across 3 projects</small></article>
        <article><span>COMPLETED</span><strong>12</strong><small>+3 this week</small></article>
        <article><span>UP NEXT</span><strong>03</strong><small>Due this week</small></article>
      </section>
      <section class="tasks">
        <div class="section-head"><h2>Your tasks</h2><span>View all →</span></div>
        <article class="task"><i></i><div><strong>Finalize homepage wireframes</strong><small>Website redesign · Due today</small></div><em>High</em></article>
        <article class="task"><i></i><div><strong>Review Q2 campaign brief</strong><small>Spring campaign · Due tomorrow</small></div><em>Medium</em></article>
        <article class="task"><i class="done">✓</i><div><strong>Share research findings</strong><small>Product discovery · Completed yesterday</small></div><em>Done</em></article>
      </section>
    </main>
  </body>
</html>`,
  },
  {
    name: 'styles.css',
    language: 'CSS',
    content: `:root { --ink: #23364b; --paper: #f7f9fb; --teal: #278f89; --line: #e6ebef; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: system-ui, sans-serif; }
.app-shell { max-width: 820px; margin: 0 auto; padding: 24px 38px; }
.topbar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 14px; }
.brand { font-size: 14px; font-weight: 800; letter-spacing: -.04em; }
.brand-mark { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; margin-right: 6px; background: #dff2ef; color: var(--teal); }
.avatar { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: #e6edf3; color: #54677d; font-size: 8px; }
.welcome { padding: 34px 0 22px; }
.eyebrow { color: #91a0ac; font-size: 8px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 8px 0; font-size: 28px; letter-spacing: -.05em; }
.welcome > p:last-child { color: #8997a3; font-size: 10px; }
.stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 9px; }
.stats article { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 7px; padding: 11px; background: white; }
.stats span { color: #94a1ad; font-size: 7px; font-weight: 800; letter-spacing: .1em; }
.stats strong { margin: 5px 0; font-size: 21px; }
.stats small { color: #98a4ae; font-size: 7px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin: 23px 0 7px; }
.section-head h2 { margin: 0; font-size: 13px; }
.section-head span { color: var(--teal); font-size: 8px; }
.task { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 11px 1px; }
.task > i { width: 12px; height: 12px; border: 1px solid #d2dbe1; border-radius: 50%; flex: none; }
.task > i.done { display: grid; place-items: center; background: var(--teal); color: white; border-color: var(--teal); font-size: 8px; font-style: normal; }
.task div { display: flex; flex: 1; flex-direction: column; gap: 4px; }
.task strong { font-size: 9px; }
.task small { color: #99a4af; font-size: 7px; }
.task em { color: #bd8d4c; background: #fff5e7; border-radius: 10px; padding: 4px 7px; font-size: 7px; font-style: normal; }
.task:last-child em { color: #8795a1; background: #f0f3f5; }
@media(max-width:480px) { .app-shell { padding: 20px 16px; } .welcome { padding-top: 26px; } }
`,
  },
  {
    name: 'app.js',
    language: 'JavaScript',
    content: `const tasks = ["Finalize homepage wireframes", "Review Q2 campaign brief"];
console.info("Taskflow is ready.", tasks.length, "tasks loaded.");`,
  },
];

const projects: Project[] = [
  { name: 'Taskflow dashboard', detail: 'Team task management · 3 files', updated: 'Edited 12 min ago' },
  { name: 'Recipe card concept', detail: 'A small recipe collection · 2 files', updated: 'Yesterday' },
];

function getLanguage(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'html') return 'HTML';
  if (extension === 'css') return 'CSS';
  if (extension === 'js') return 'JavaScript';
  return 'Text';
}

export function BuilderV4() {
  const [files, setFiles] = useState(initialFiles);
  const [activeFile, setActiveFile] = useState('index.html');
  const [project, setProject] = useState(projects[0].name);
  const [projectFilter, setProjectFilter] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [toast, setToast] = useState('');
  const [savedFiles, setSavedFiles] = useState(initialFiles);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [checkResult, setCheckResult] = useState('');
  const [previewKey, setPreviewKey] = useState(0);

  const currentFile = files.find((file) => file.name === activeFile) ?? files[0];
  const isDirty = JSON.stringify(files) !== JSON.stringify(savedFiles);
  const visibleFiles = useMemo(
    () => files.filter((file) => file.name.toLowerCase().includes(fileFilter.toLowerCase())),
    [files, fileFilter],
  );
  const visibleProjects = projects.filter((item) => item.name.toLowerCase().includes(projectFilter.toLowerCase()));
  const previewDocument = useMemo(() => {
    let html = files.find((file) => file.name === 'index.html')?.content ?? '';
    const css = files.find((file) => file.name === 'styles.css')?.content ?? '';
    const js = files.find((file) => file.name === 'app.js')?.content ?? '';
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">`;
    html = html.replace('</head>', `${policy}<style>${css}</style></head>`);
    html = html.replace('<link rel="stylesheet" href="styles.css" />', '');
    return html.replace('</body>', `<script>${js}</script></body>`);
  }, [files, previewKey]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function updateContent(value: string) {
    setFiles((list) => list.map((file) => file.name === activeFile ? { ...file, content: value } : file));
  }

  function addFile() {
    const name = 'untitled.txt';
    if (files.some((file) => file.name === name)) {
      setActiveFile(name);
      notify('untitled.txt is already in this project.');
      return;
    }
    setFiles((list) => [...list, { name, language: 'Text', content: '' }]);
    setActiveFile(name);
  }

  function save() {
    setSavedFiles(files.map((file) => ({ ...file })));
    setSnapshots((list) => [`Saved source · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, ...list]);
    notify('Source saved in this browser workspace.');
  }

  function downloadSource() {
    const blob = new Blob([files.map((file) => `/* ${file.name} */\n${file.content}`).join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tinanai-source-bundle.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Source bundle downloaded. ZIP packaging is unavailable.');
  }

  function renameFile() {
    const next = renameValue.trim();
    const safePath = next.length > 0 && !next.startsWith('/') && !next.includes('\\') &&
      !next.split('/').some((segment) => segment === '..' || segment === '.' || segment === '');
    if (!safePath) {
      notify('Use a safe relative path, such as src/view.html.');
      return;
    }
    if (activeFile === 'index.html') {
      notify('index.html is the protected entry file and cannot be renamed.');
      return;
    }
    if (files.some((file) => file.name === next)) {
      notify('A file already exists at that path.');
      return;
    }
    setFiles((list) => list.map((file) => file.name === activeFile ? { ...file, name: next, language: getLanguage(next) } : file));
    setActiveFile(next);
    setRenameOpen(false);
    notify(`Renamed to ${next}.`);
  }

  function replaceLiteral() {
    if (!findText) {
      notify('Enter text to find before replacing.');
      return;
    }
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = currentFile.content.match(new RegExp(escaped, 'g'))?.length ?? 0;
    if (matches) updateContent(currentFile.content.replace(new RegExp(escaped, 'g'), replaceText));
    notify(matches ? `Replaced ${matches} literal match${matches === 1 ? '' : 'es'} in ${activeFile}.` : 'No matching text in this file.');
  }

  function runStaticChecks() {
    const validPaths = files.every((file) => file.name && !file.name.startsWith('/') && !file.name.includes('\\') && !file.name.split('/').some((part) => part === '..' || part === '.' || !part));
    const hasEntry = files.some((file) => file.name === 'index.html');
    setCheckResult(`${hasEntry ? 'Entry file present' : 'Missing index.html'} · ${validPaths ? 'safe relative paths' : 'review unsafe paths'} · ${files.length} source files`);
  }

  return (
    <div className="tinanai-current builder-v4 min-h-screen">
      <style>{`
        .builder-v4{--v4-bg:#080f1d;--v4-deep:#0b1424;--v4-panel:#101d31;--v4-panel2:#13233a;--v4-line:#253750;--v4-text:#e5edf8;--v4-dim:#98a9c0;--v4-muted:#71839c;--v4-cyan:#54d9ed;--v4-blue:#6698ff;min-height:100dvh;padding:0;background:radial-gradient(ellipse at 52% -30%,#17365d 0,transparent 56%),var(--v4-bg);color:var(--v4-text);font:12px/1.45 var(--app-font-sans,Manrope,sans-serif);overflow-x:hidden}
        .builder-v4 *{box-sizing:border-box}.b4-shell{min-height:100dvh;display:flex;flex-direction:column}.b4-topbar{height:58px;display:flex;align-items:center;gap:18px;padding:0 22px;border-bottom:1px solid #21324a;background:#0a1322}.b4-brand{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:.06em;font-size:12px;white-space:nowrap}.b4-mark{display:grid;place-items:center;width:27px;height:27px;border-radius:7px;background:#4dd8ea;color:#06111f;font-size:15px;font-weight:900;letter-spacing:-.08em}.b4-brand small{font-size:9px;color:#7f91aa;font-weight:700;letter-spacing:.16em;margin-left:3px}.b4-crumb{display:flex;align-items:center;gap:8px;color:#8294ac;font-size:10px}.b4-crumb strong{color:#dbe7f7;font-weight:700}.b4-spacer{flex:1}.b4-local{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid #263850;border-radius:5px;color:#9eb0c7;font-size:9px}.b4-live-dot{width:6px;height:6px;border-radius:50%;background:#58d9c1}.b4-avatar{display:grid;place-items:center;width:27px;height:27px;background:#233956;color:#d2e2f8;border-radius:50%;font-size:9px;font-weight:800}.b4-toolbar{min-height:47px;display:flex;align-items:center;gap:8px;padding:7px 22px;border-bottom:1px solid #1d2c42;background:#0b1525}.b4-toolbar-crumb{display:flex;align-items:center;gap:8px;color:#8293aa;font-size:10px;white-space:nowrap}.b4-toolbar-crumb strong{color:#dce8f8}.b4-toolbar-actions{display:flex;align-items:center;gap:6px;margin-left:auto}.b4-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:30px;padding:6px 10px;border:1px solid #2a3d58;border-radius:5px;background:#122138;color:#c4d2e5;font:600 9px var(--app-font-sans,Manrope,sans-serif);white-space:nowrap;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}.b4-btn:hover{background:#1a2c47;border-color:#426080;transform:translateY(-1px)}.b4-btn.primary{background:#57d8e9;border-color:#57d8e9;color:#071522;font-weight:800}.b4-btn.primary:hover{background:#7be5f1}.b4-btn.ghost{background:transparent}.b4-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}.b4-icon-btn{display:grid;place-items:center;width:29px;height:29px;border:1px solid transparent;border-radius:5px;background:transparent;color:#93a5bd;cursor:pointer}.b4-icon-btn:hover{background:#1a2b44;color:#eaf2fd}.b4-workspace{display:grid;grid-template-columns:220px minmax(400px,1fr) 300px;flex:1;min-height:0}.b4-sidebar{min-width:0;padding:14px 11px;background:#0b1423;border-right:1px solid #20314a}.b4-sidebar-label{display:flex;align-items:center;justify-content:space-between;color:#8194ae;font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;padding:2px 4px 10px}.b4-search{height:30px;display:flex;align-items:center;gap:7px;margin-bottom:9px;padding:0 8px;border:1px solid #293a53;border-radius:5px;background:#101d30;color:#8192aa}.b4-search input{width:100%;border:0;outline:0;background:none;color:#e1ebf8;font:9px var(--app-font-sans,Manrope,sans-serif)}.b4-search input::placeholder{color:#697d98}.b4-projects{display:flex;flex-direction:column;gap:4px}.b4-project{width:100%;display:flex;align-items:center;gap:8px;padding:8px 7px;text-align:left;border:1px solid transparent;border-radius:6px;background:none;color:#aebdd0;cursor:pointer}.b4-project:hover{background:#111f33}.b4-project.active{background:#142741;border-color:#2a4567;color:#e7f1ff}.b4-project-icon{display:grid;place-items:center;width:27px;height:27px;flex:none;border-radius:6px;background:#163348;color:#63d8e6}.b4-project-info{min-width:0}.b4-project-info b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;font-weight:700}.b4-project-info small{display:block;margin-top:3px;color:#7e91aa;font-size:8px}.b4-projects-empty{padding:12px 6px;color:#7e91aa;font-size:9px}.b4-side-note{margin-top:18px;padding:11px 9px;border-top:1px solid #20314a;color:#8192a8;font-size:9px;line-height:1.6}.b4-side-note strong{display:flex;align-items:center;gap:6px;color:#bac9dc;font-size:9px}.b4-side-note p{margin:7px 0 0}.b4-center{display:flex;flex-direction:column;gap:11px;min-width:0;padding:13px}.b4-editor-card,.b4-panel{min-width:0;border:1px solid #263954;border-radius:7px;background:linear-gradient(145deg,#101e32,#0d192b);overflow:hidden}.b4-editor-card{display:flex;flex-direction:column;flex:1;min-height:420px}.b4-card-head{display:flex;align-items:center;gap:9px;min-height:47px;padding:9px 12px;border-bottom:1px solid #263750}.b4-head-mark{display:grid;place-items:center;width:27px;height:27px;border:1px solid #254264;background:#142b44;color:#65d9e7;border-radius:6px}.b4-head-copy h1{font-size:11px;line-height:1.2;margin:0;font-weight:750}.b4-head-copy p{color:#8093ac;font-size:8px;margin:4px 0 0}.b4-head-spacer{flex:1}.b4-save-indicator{display:flex;align-items:center;gap:5px;margin-right:4px;color:#79d7bf;font-size:8px;white-space:nowrap}.b4-save-indicator.unsaved{color:#edc36f}.b4-tabs{display:flex;gap:1px;align-items:stretch;min-height:35px;padding:0 8px;background:#0d192a;border-bottom:1px solid #263750;overflow:auto}.b4-filetab{display:inline-flex;align-items:center;gap:6px;padding:0 11px;border:0;border-bottom:2px solid transparent;background:transparent;color:#8496ad;font:9px var(--app-font-mono,monospace);white-space:nowrap;cursor:pointer}.b4-filetab.active{border-bottom-color:#5bd6e7;background:#12233a;color:#e0edf9}.b4-filetab svg{color:#63cee1}.b4-editor-tools{display:flex;align-items:center;gap:6px;min-height:36px;padding:5px 10px;border-bottom:1px solid #202f46;color:#8092aa;font-size:8px}.b4-editor-tools code{font:8px var(--app-font-mono,monospace);color:#b2c3d7}.b4-tool-spacer{flex:1}.b4-tool-link{display:inline-flex;align-items:center;gap:5px;border:0;background:none;color:#9bb2cd;font-size:8px;cursor:pointer;padding:5px}.b4-tool-link:hover{color:#6addf0}.b4-editor-area{display:grid;grid-template-columns:42px minmax(0,1fr);flex:1;min-height:280px;background:#091321;overflow:auto}.b4-line-numbers{padding:12px 9px 14px 0;text-align:right;color:#52667f;font:9px/1.8 var(--app-font-mono,monospace);white-space:pre;user-select:none}.b4-code-input{display:block;width:100%;min-width:490px;min-height:100%;resize:none;border:0;outline:0;background:transparent;color:#d2deee;padding:12px 14px 20px 0;font:9px/1.8 var(--app-font-mono,monospace);tab-size:2;white-space:pre}.b4-code-input:focus{box-shadow:inset 1px 0 #406184}.b4-editor-foot{display:flex;align-items:center;gap:13px;min-height:25px;padding:4px 10px;border-top:1px solid #263750;background:#0c1829;color:#71849d;font:8px var(--app-font-mono,monospace)}.b4-editor-foot span:last-child{margin-left:auto}.b4-editor-foot .modified{color:#edc36f}.b4-filter-row{display:flex;gap:7px;align-items:center;padding:8px 10px;border-bottom:1px solid #243650;background:#101d30}.b4-filter-row .b4-search{margin:0;flex:1}.b4-file-list{display:flex;align-items:center;gap:3px;min-height:38px;padding:4px 9px;border-bottom:1px solid #263750;background:#101d30;overflow:auto}.b4-file-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:#95a8c0;font-size:8px;white-space:nowrap;cursor:pointer}.b4-file-chip.active{border-color:#294867;background:#142841;color:#e1edf9}.b4-file-chip span{font:8px var(--app-font-mono,monospace)}.b4-work-tools{display:flex;gap:6px;align-items:center;margin-left:auto}.b4-lower{display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:11px}.b4-preview{overflow:hidden}.b4-panel-head{display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 10px;border-bottom:1px solid #263750}.b4-panel-head h2{margin:0;font-size:9px;font-weight:750}.b4-panel-head small{color:#8093aa;font-size:8px}.b4-panel-head .b4-btn{margin-left:auto;min-height:26px;padding:4px 7px}.b4-preview-window{height:245px;margin:9px;background:#f7f9fb;border-radius:3px;overflow:hidden}.b4-preview-window iframe{width:100%;height:100%;border:0;background:#f7f9fb}.b4-preview-note{display:flex;align-items:flex-start;gap:7px;padding:9px 10px;border-top:1px solid #4a3f2a;background:#1d1d20;color:#d3bd84;font-size:8px;line-height:1.55}.b4-preview-note svg{flex:none;margin-top:1px}.b4-preview-note strong{color:#ead59e}.b4-checks{padding-bottom:10px}.b4-check-row{display:flex;align-items:flex-start;gap:8px;padding:10px;border-bottom:1px solid #22334c}.b4-check-icon{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:5px;background:#123a43;color:#71dce9}.b4-check-row b{display:block;color:#d6e2f0;font-size:8px}.b4-check-row small{display:block;margin-top:4px;color:#8092aa;font-size:8px;line-height:1.5}.b4-check-state{margin-left:auto;color:#d5bd7c;font-size:7px;white-space:nowrap}.b4-check-action{padding:9px 10px}.b4-check-action .b4-btn{width:100%}.b4-result{margin:0 10px 10px;padding:8px;border:1px solid #2a4360;border-radius:5px;background:#0b192a;color:#a8c3dd;font-size:8px;line-height:1.6}.b4-unavailable{margin:0 10px;padding:9px;border:1px solid #354052;border-radius:5px;background:#111b29;color:#8999ad;font-size:8px;line-height:1.55}.b4-unavailable strong{display:block;margin-bottom:3px;color:#b3c2d4;font-size:8px}.b4-right{min-width:0;padding:13px 11px;background:#0b1423;border-left:1px solid #20314a}.b4-right-head{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 11px}.b4-right-head h2{font-size:10px;margin:0}.b4-right-head span{color:#8193aa;font-size:8px}.b4-section{padding:11px 0;border-top:1px solid #20314a}.b4-section-title{display:flex;align-items:center;gap:7px;color:#c9d7e8;font-size:9px;font-weight:750}.b4-section-title svg{color:#62d4e4}.b4-section-copy{margin:7px 0 0;color:#8193aa;font-size:8px;line-height:1.6}.b4-find-grid{display:grid;grid-template-columns:1fr;gap:6px;margin-top:9px}.b4-input{width:100%;height:29px;border:1px solid #2a3c56;border-radius:4px;background:#101d30;color:#deebf9;padding:0 8px;outline:0;font:8px var(--app-font-mono,monospace)}.b4-input:focus{border-color:#4cbfd2}.b4-inline-actions{display:flex;gap:6px;margin-top:7px}.b4-inline-actions .b4-btn{flex:1}.b4-mini-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px}.b4-mini-row span{color:#899bb2;font-size:8px}.b4-status-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 6px;border:1px solid #2b4a54;border-radius:99px;color:#83ded2;font-size:7px;white-space:nowrap}.b4-status-pill i{width:5px;height:5px;border-radius:50%;background:#61d6c7}.b4-limit-box{margin-top:10px;padding:10px;border:1px solid #283b53;border-radius:6px;background:#0f1c2e}.b4-limit-box strong{display:flex;align-items:center;gap:6px;font-size:8px;color:#bfcee0}.b4-limit-box p{margin:7px 0 0;color:#8799b0;font-size:8px;line-height:1.6}.b4-limit-box p b{color:#b8c8d8;font-weight:700}.b4-statusbar{display:flex;align-items:center;gap:13px;min-height:26px;padding:0 14px;border-top:1px solid #20314a;background:#091321;color:#7588a1;font:8px var(--app-font-mono,monospace)}.b4-statusbar .ok{color:#71d9c7}.b4-statusbar span:last-child{margin-left:auto}.b4-overlay{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:18px;background:#030916bd;backdrop-filter:blur(3px)}.b4-dialog{width:min(430px,100%);border:1px solid #34506e;border-radius:8px;background:#101d30;box-shadow:0 24px 70px #0009;overflow:hidden}.b4-dialog-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #283a52}.b4-dialog-head strong{flex:1;font-size:10px}.b4-dialog-body{padding:14px;color:#96a9c0;font-size:9px;line-height:1.6}.b4-dialog-foot{display:flex;justify-content:flex-end;gap:7px;padding:10px 14px;border-top:1px solid #283a52}.b4-toast{position:fixed;z-index:30;left:50%;bottom:36px;transform:translateX(-50%);padding:9px 13px;border:1px solid #3b6273;border-radius:6px;background:#11283a;color:#daf6f6;font-size:9px;box-shadow:0 12px 35px #0007;animation:b4-toast-in .18s ease-out}@keyframes b4-toast-in{from{opacity:0;transform:translate(-50%,5px)}to{opacity:1;transform:translate(-50%,0)}}.b4-hidden-input{display:none}
        @media(max-width:1200px){.b4-workspace{grid-template-columns:190px minmax(0,1fr)}.b4-right{grid-column:1/-1;border-left:0;border-top:1px solid #20314a;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 16px;padding:11px 16px}.b4-right-head{grid-column:1/-1}.b4-limit-box{grid-column:1/-1}.b4-lower{grid-template-columns:minmax(0,1fr) 220px}}
        @media(max-width:780px){.b4-topbar{padding:0 12px;gap:10px}.b4-crumb,.b4-local{display:none}.b4-toolbar{padding:7px 12px;overflow:auto}.b4-toolbar-actions{gap:4px}.b4-toolbar-actions .b4-btn{padding:6px 7px}.b4-workspace{grid-template-columns:minmax(0,1fr)}.b4-sidebar{padding:9px 12px;border-right:0;border-bottom:1px solid #20314a}.b4-sidebar-label{padding-bottom:7px}.b4-sidebar>.b4-search,.b4-side-note{display:none}.b4-projects{flex-direction:row;overflow:auto}.b4-project{width:auto;min-width:165px}.b4-right{grid-column:auto;display:flex;flex-direction:column;padding:12px}.b4-lower{grid-template-columns:1fr}.b4-preview-window{height:225px}.b4-center{padding:10px}.b4-toolbar-crumb{font-size:9px}}
        @media(max-width:480px){.b4-topbar{height:52px}.b4-brand small{display:none}.b4-toolbar-crumb{display:none}.b4-toolbar-actions .hide-mobile{display:none}.b4-toolbar-actions .b4-btn{font-size:8px}.b4-card-head{flex-wrap:wrap}.b4-save-indicator{margin-left:auto}.b4-editor-tools .hide-mobile{display:none}.b4-editor-card{min-height:400px}.b4-editor-area{grid-template-columns:32px minmax(0,1fr)}.b4-line-numbers{padding-right:6px;font-size:8px}.b4-code-input{min-width:440px;font-size:8px}.b4-editor-foot{gap:7px;padding:4px 7px}.b4-editor-foot .hide-small{display:none}.b4-right{padding:11px}.b4-statusbar{gap:7px;padding:0 8px}.b4-statusbar .hide-small{display:none}}
      `}</style>
      <div className="b4-shell">
        <header className="b4-topbar">
          <div className="b4-brand"><span className="b4-mark">t</span> TINANAI <small>BUILDER</small></div>
          <div className="b4-crumb"><span>Workspace</span><ArrowRight size={12} /><strong>{project}</strong><ChevronDown size={12} /></div>
          <div className="b4-spacer" />
          <div className="b4-local"><i className="b4-live-dot" /> Browser-local workspace</div>
          <button className="b4-icon-btn" aria-label="Help and limitations" onClick={() => notify('Builder capabilities and limitations are summarized in the right panel.')}><CircleHelp size={15} /></button>
          <span className="b4-avatar" title="Workspace user">AM</span>
        </header>
        <div className="b4-toolbar">
          <div className="b4-toolbar-crumb"><span>Projects</span><ArrowRight size={11} /><strong>{project}</strong><span className="b4-live-dot" /></div>
          <div className="b4-toolbar-actions">
            <button className="b4-btn ghost" onClick={() => setShowVersions(true)}><History size={13} /> Versions</button>
            <button className="b4-btn ghost hide-mobile" disabled title="GitHub integration is not connected"><GitBranch size={13} /> GitHub · unavailable</button>
            <button className="b4-btn" onClick={downloadSource}><ArrowDownToLine size={13} /> Export source</button>
            <button className="b4-btn primary" onClick={save}><Check size={13} /> Save source</button>
          </div>
        </div>
        <div className="b4-workspace">
          <aside className="b4-sidebar">
            <div className="b4-sidebar-label"><span>Projects</span><span>{projects.length}</span></div>
            <label className="b4-search"><Search size={13} /><input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Filter projects…" aria-label="Filter projects" /></label>
            <div className="b4-projects">
              {visibleProjects.map((item) => (
                <button key={item.name} className={`b4-project ${project === item.name ? 'active' : ''}`} onClick={() => { setProject(item.name); notify(`${item.name} selected in this local concept.`); }}>
                  <span className="b4-project-icon"><FolderOpen size={14} /></span><span className="b4-project-info"><b>{item.name}</b><small>{item.detail}</small></span>
                </button>
              ))}
              {!visibleProjects.length && <div className="b4-projects-empty">No projects match that filter.</div>}
            </div>
            <div className="b4-side-note"><strong><LockKeyhole size={13} /> Private to this browser</strong><p>Source stays in this prototype workspace. It is not synced to an account or shared across devices.</p></div>
          </aside>
          <main className="b4-center">
            <section className="b4-editor-card">
              <div className="b4-card-head">
                <span className="b4-head-mark"><Code2 size={15} /></span>
                <div className="b4-head-copy"><h1>Source workspace</h1><p>Inspect and edit real project files</p></div>
                <div className="b4-head-spacer" />
                <span className={`b4-save-indicator ${isDirty ? 'unsaved' : ''}`}><i className={isDirty ? 'b4-live-dot' : 'b4-live-dot'} />{isDirty ? 'Unsaved changes' : 'Saved locally'}</span>
                <button className="b4-btn" onClick={addFile}><FilePlus2 size={12} /> Add file</button>
              </div>
              <div className="b4-filter-row">
                <label className="b4-search"><Search size={12} /><input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filter project files…" aria-label="Filter project files" /></label>
                <div className="b4-work-tools">
                  <button className="b4-tool-link" onClick={() => setFindOpen(!findOpen)}><Search size={12} /> Find / replace</button>
                  <button className="b4-tool-link" onClick={() => { setRenameValue(activeFile); setRenameOpen(true); }} disabled={activeFile === 'index.html'} title={activeFile === 'index.html' ? 'Entry file is protected' : 'Rename active file'}>Rename</button>
                </div>
              </div>
              {findOpen && <div className="b4-filter-row">
                <input className="b4-input" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Literal text to find" aria-label="Find literal text" />
                <input className="b4-input" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replace with" aria-label="Replacement text" />
                <button className="b4-btn" onClick={replaceLiteral}>Replace all</button>
              </div>}
              <div className="b4-file-list" aria-label="Project files">
                {visibleFiles.map((file) => <button key={file.name} className={`b4-file-chip ${file.name === activeFile ? 'active' : ''}`} onClick={() => setActiveFile(file.name)}><FileCode2 size={12} /><span>{file.name}</span></button>)}
                {visibleFiles.length === 0 && <span className="b4-projects-empty">No files match.</span>}
              </div>
              <div className="b4-editor-tools">
                <code>{currentFile.name}</code><span>·</span><span>{currentFile.language}</span><span className="b4-tool-spacer" />
                <button className="b4-tool-link hide-mobile" onClick={() => notify('File rename uses a validated relative path; index.html stays protected.')}><CircleHelp size={11} /> Safe paths</button>
                <span className="hide-mobile">UTF-8</span>
              </div>
              <div className="b4-editor-area">
                <div className="b4-line-numbers" aria-hidden="true">{currentFile.content.split('\n').map((_, index) => index + 1).join('\n')}</div>
                <textarea className="b4-code-input" aria-label={`${currentFile.name} source editor`} spellCheck={false} value={currentFile.content} onChange={(event) => updateContent(event.target.value)} />
              </div>
              <div className="b4-editor-foot"><span>LOCAL SOURCE</span><span className="hide-small">{currentFile.language}</span><span>{currentFile.content.split('\n').length} lines</span><span className={isDirty ? 'modified' : ''}>{isDirty ? '● Modified' : '● Saved'}</span></div>
            </section>
            <div className="b4-lower">
              <section className="b4-panel b4-preview">
                <div className="b4-panel-head"><Play size={13} color="#56d7e7" /><h2>Static preview</h2><span className="b4-status-pill"><i /> Sandboxed</span><button className="b4-btn" onClick={() => setPreviewKey((n) => n + 1)}><RefreshCw size={11} /> Refresh</button></div>
                <div className="b4-preview-window"><iframe key={previewKey} title="Static project preview" sandbox="allow-scripts" srcDoc={previewDocument} /></div>
                <div className="b4-preview-note"><AlertTriangle size={12} /><div><strong>Static HTML, CSS and JavaScript only.</strong> Sandboxed without same-origin access; CSP blocks network, external assets, and app APIs. No React/Vite runtime, terminal, backend, or resource quotas.</div></div>
              </section>
              <section className="b4-panel b4-checks">
                <div className="b4-panel-head"><ShieldCheck size={14} color="#64d6e6" /><h2>Source confidence</h2><small>local only</small></div>
                <div className="b4-check-row"><span className="b4-check-icon"><Check size={12} /></span><div><b>Reviewable source</b><small>Edits remain visible in the file editor before you save.</small></div><span className="b4-check-state">Available</span></div>
                <div className="b4-check-row"><span className="b4-check-icon"><ShieldCheck size={12} /></span><div><b>Static path check</b><small>Basic entry-file and relative-path checks; not a build.</small></div></div>
                <div className="b4-check-action"><button className="b4-btn" onClick={runStaticChecks}><ShieldCheck size={12} /> Run static checks</button></div>
                {checkResult && <p className="b4-result">{checkResult}</p>}
                <div className="b4-unavailable"><strong>Runtime smoke test · unavailable</strong>Runtime diagnostics are not connected in this mock workspace. The iframe preview is not a production build or security boundary.</div>
              </section>
            </div>
          </main>
          <aside className="b4-right">
            <div className="b4-right-head"><h2>Workspace controls</h2><span>Explicit, local actions</span></div>
            <section className="b4-section">
              <div className="b4-section-title"><Search size={13} /> Literal find &amp; replace</div>
              <p className="b4-section-copy">Search only the selected file. Text is matched literally, not as a regular expression.</p>
              <div className="b4-find-grid">
                <input className="b4-input" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Find in active file" aria-label="Find in active file" />
                <input className="b4-input" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replace with" aria-label="Replace text with" />
              </div>
              <div className="b4-inline-actions"><button className="b4-btn" onClick={replaceLiteral}>Replace all</button><button className="b4-btn ghost" onClick={() => { setFindText(''); setReplaceText(''); }}>Clear</button></div>
            </section>
            <section className="b4-section">
              <div className="b4-section-title"><History size={13} /> Saved versions</div>
              <p className="b4-section-copy">Create a local snapshot when saving. No remote version history is connected.</p>
              <div className="b4-mini-row"><span>{snapshots.length} saved snapshot{snapshots.length === 1 ? '' : 's'}</span><button className="b4-btn" onClick={() => setShowVersions(true)}>Review</button></div>
            </section>
            <section className="b4-section">
              <div className="b4-section-title"><Terminal size={13} /> Execution &amp; integrations</div>
              <div className="b4-mini-row"><span>Terminal execution</span><span className="b4-status-pill">Unavailable</span></div>
              <div className="b4-mini-row"><span>GitHub connection</span><span className="b4-status-pill">Not connected</span></div>
              <div className="b4-mini-row"><span>Deployments</span><span className="b4-status-pill">Unavailable</span></div>
              <p className="b4-section-copy">Framework builds and EUREKA v1.1 integration are not connected.</p>
            </section>
            <div className="b4-limit-box"><strong><LockKeyhole size={13} /> Keep control of your code</strong><p>Changes are editable and reviewable before saving. <b>Nothing deploys, executes in a terminal, or syncs to GitHub.</b> ZIP export is not available; export downloads source text.</p></div>
          </aside>
        </div>
        <footer className="b4-statusbar"><span className="ok">● Local</span><span>{project}</span><span className="hide-small">Static source workspace</span><span>{isDirty ? 'Unsaved' : 'All changes saved'}</span></footer>
      </div>

      {renameOpen && <div className="b4-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameOpen(false); }}>
        <section className="b4-dialog" role="dialog" aria-modal="true" aria-labelledby="b4-rename-title">
          <div className="b4-dialog-head"><FileCode2 size={14} color="#65d9e7" /><strong id="b4-rename-title">Rename source file</strong><button className="b4-icon-btn" aria-label="Close rename dialog" onClick={() => setRenameOpen(false)}><X size={14} /></button></div>
          <div className="b4-dialog-body"><p>Choose a safe relative path. Absolute paths, parent-directory segments, and duplicate paths are rejected. <b>index.html is protected as the project entry file.</b></p><input className="b4-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') renameFile(); }} aria-label="New relative file path" autoFocus /></div>
          <div className="b4-dialog-foot"><button className="b4-btn" onClick={() => setRenameOpen(false)}>Cancel</button><button className="b4-btn primary" onClick={renameFile}>Rename file</button></div>
        </section>
      </div>}
      {showVersions && <div className="b4-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVersions(false); }}>
        <section className="b4-dialog" role="dialog" aria-modal="true" aria-labelledby="b4-history-title">
          <div className="b4-dialog-head"><Clock3 size={14} color="#65d9e7" /><strong id="b4-history-title">Saved in this browser</strong><button className="b4-icon-btn" aria-label="Close versions" onClick={() => setShowVersions(false)}><X size={14} /></button></div>
          <div className="b4-dialog-body">{snapshots.length ? snapshots.map((snapshot, index) => <div key={`${snapshot}-${index}`} className="b4-mini-row"><span>{snapshot}</span><span className="b4-status-pill">Local</span></div>) : <p>No saved versions yet. Save source to create a browser-local snapshot. Versions are not synced or recoverable from another device.</p>}</div>
          <div className="b4-dialog-foot"><button className="b4-btn" onClick={() => setShowVersions(false)}>Close</button><button className="b4-btn primary" onClick={() => { setShowVersions(false); save(); }}>Save current source</button></div>
        </section>
      </div>}
      {toast && <div className="b4-toast" role="status">{toast}</div>}
    </div>
  );
}
