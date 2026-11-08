import './_group.css';
import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, Check,
  CheckCheck, ChevronDown, Circle, Clock3, Code2, Command, Copy, Download,
  FileCode2, FilePlus2, FolderGit2, GitBranch, History, Layers3, LockKeyhole,
  PanelLeftClose, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  Sparkles, Terminal, WandSparkles, X,
} from 'lucide-react';

type Mode = 'Plan' | 'Build' | 'Repair';
type SourceFile = { name: string; language: string; content: string };

const starterFiles: SourceFile[] = [
  {
    name: 'index.html',
    language: 'HTML',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fieldnotes — Studio journal</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div class="workspace">
      <aside class="sidebar">
        <a class="wordmark" href="#"><span class="mark">f</span> fieldnotes</a>
        <nav aria-label="Workspace">
          <a class="nav-item active" href="#"><span>◫</span> Overview</a>
          <a class="nav-item" href="#"><span>▤</span> My projects <b>8</b></a>
          <a class="nav-item" href="#"><span>◎</span> Shared with me</a>
        </nav>
        <div class="side-bottom">A quiet place to make.<br /><small>Personal workspace</small></div>
      </aside>
      <main class="main">
        <header><span>MONDAY, MAY 19</span><div class="avatar">AM</div></header>
        <section class="greeting">
          <p class="kicker">YOUR STUDIO, IN GOOD ORDER</p>
          <h1>Make room for<br /><em>the interesting</em>.</h1>
          <p class="intro">A little space to gather thoughts, find patterns,<br />and get back to the work that matters.</p>
        </section>
        <section class="featured">
          <div class="feature-art"><div class="sun"></div><div class="hill hill-one"></div><div class="hill hill-two"></div><span>01 / 04</span></div>
          <div class="feature-copy"><small>IN PROGRESS · 6 NOTES</small><h2>Spring field<br />observations</h2><p>Small details from the edges of the garden, gathered slowly.</p><a href="#">Open collection <b>↗</b></a></div>
        </section>
        <section class="recent"><div class="recent-title"><h2>Recently gathered</h2><a href="#">View all →</a></div>
          <article><span class="note-icon">✳</span><div><b>The color of late afternoon</b><small>Journal entry · 4 min read</small></div><time>Today</time></article>
          <article><span class="note-icon coral">⌁</span><div><b>Things that grow in cracks</b><small>Clippings · 3 fragments</small></div><time>Yesterday</time></article>
          <article><span class="note-icon blue">◌</span><div><b>A useful kind of unfinished</b><small>Thought · 2 min read</small></div><time>May 16</time></article>
        </section>
      </main>
    </div>
  </body>
</html>`,
  },
  {
    name: 'styles.css',
    language: 'CSS',
    content: `:root {
  --ink: #24332e;
  --paper: #f7f6f0;
  --moss: #75877a;
  --clay: #d98063;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: Georgia, serif; }
.workspace { min-height: 100vh; display: grid; grid-template-columns: 220px 1fr; }
.sidebar { padding: 32px 22px; border-right: 1px solid #e3e1d8; }
.wordmark { color: var(--ink); font: 700 16px Arial, sans-serif; text-decoration: none; }
.mark { display: inline-grid; place-items: center; width: 24px; height: 24px; margin-right: 6px; border-radius: 7px; background: #dbe2d8; color: #596e5f; }
.nav-item { display: flex; gap: 12px; padding: 11px 10px; color: #7b827c; text-decoration: none; font: 12px Arial, sans-serif; }
.nav-item.active { background: #e9ebe3; color: var(--ink); border-radius: 6px; }
.nav-item b { margin-left: auto; }
.side-bottom { margin-top: 42vh; color: #727b73; font: 11px/1.7 Arial, sans-serif; }
.main { max-width: 1000px; padding: 28px 7vw 64px; margin: auto; width: 100%; }
.main header { display: flex; justify-content: space-between; align-items: center; color: #8c9289; font: 10px Arial, sans-serif; letter-spacing: .12em; }
.avatar { display: grid; place-items: center; width: 30px; height: 30px; background: #e6ddd0; color: #6e6558; border-radius: 50%; letter-spacing: 0; }
.greeting { padding: 55px 0 35px; }
.kicker { color: #788878; font: 10px Arial, sans-serif; letter-spacing: .15em; }
h1 { font-size: clamp(42px, 6vw, 72px); line-height: .98; letter-spacing: -.055em; font-weight: 400; margin: 16px 0; }
h1 em { color: #718474; }
.intro { color: #777e76; font: 13px/1.7 Arial, sans-serif; }
.featured { display: grid; grid-template-columns: 1.15fr .85fr; background: #ecece3; min-height: 245px; }
.feature-art { min-height: 245px; position: relative; overflow: hidden; background: #d9ded2; }
.feature-art > span { position: absolute; bottom: 16px; left: 18px; font: 10px Arial; color: white; }
.sun { width: 76px; height: 76px; border-radius: 50%; background: #e6a486; position: absolute; top: 30px; right: 21%; }
.hill { position: absolute; width: 130%; height: 110px; left: -10%; bottom: -20px; border-radius: 50% 50% 0 0; transform: rotate(-8deg); }
.hill-one { background: #819487; }
.hill-two { background: #a1ad9e; bottom: -59px; left: 13%; transform: rotate(9deg); }
.feature-copy { padding: 30px; align-self: center; }
.feature-copy small { color: #788878; font: 9px Arial; letter-spacing: .12em; }
.feature-copy h2 { font-size: 27px; line-height: 1.04; font-weight: 400; margin: 14px 0 10px; }
.feature-copy p { color: #777e76; font: 11px/1.6 Arial, sans-serif; max-width: 230px; }
.feature-copy a, .recent-title a { color: #617869; font: 11px Arial, sans-serif; text-decoration: none; }
.feature-copy a b { margin-left: 6px; }
.recent { margin-top: 37px; }
.recent-title { display: flex; justify-content: space-between; align-items: center; }
.recent-title h2 { font-size: 18px; font-weight: 400; }
.recent article { display: flex; align-items: center; gap: 13px; padding: 14px 0; border-top: 1px solid #e5e3db; }
.note-icon { display: grid; place-items: center; width: 34px; height: 34px; background: #e2e8df; color: #748777; border-radius: 50%; }
.note-icon.coral { background: #f0e1d9; color: #c77f68; }.note-icon.blue { background: #e0e7e6; color: #718c8a; }
.recent article div { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.recent article b { font-size: 12px; font-weight: 400; }
.recent article small, .recent article time { color: #93978f; font: 10px Arial, sans-serif; }
@media(max-width:650px) { .workspace { grid-template-columns: 1fr; } .sidebar { display: none; } .main { padding: 22px 20px 40px; } .featured { grid-template-columns: 1fr; } .feature-art { min-height: 170px; } .feature-copy { padding: 22px; } .greeting { padding: 40px 0 24px; } }
`,
  },
  {
    name: 'app.js',
    language: 'JavaScript',
    content: `const collections = [
  { title: "Spring field observations", notes: 6 },
  { title: "A useful kind of unfinished", notes: 3 },
];

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelector(".nav-item.active")?.classList.remove("active");
    item.classList.add("active");
  });
});

console.info("Fieldnotes is ready.", collections.length, "collections loaded.");`,
  },
];

const projects = [
  { name: 'Fieldnotes journal', detail: 'Personal knowledge garden', status: 'Editing', files: 3, color: 'sage', time: 'Edited 4 min ago' },
  { name: 'Northline studio', detail: 'Independent design practice', status: 'Ready', files: 5, color: 'gold', time: 'Yesterday' },
  { name: 'Civic atlas', detail: 'Neighborhood resource map', status: 'Draft', files: 4, color: 'blue', time: 'May 16' },
  { name: 'Recipe archive', detail: 'A family kitchen index', status: 'Ready', files: 3, color: 'rose', time: 'May 12' },
];

const planItems = [
  ['01', 'Keep the layout breathable', 'Editorial hierarchy with a warm, paper-like canvas'],
  ['02', 'Make collections easy to scan', 'Three recent entries with category and recency'],
  ['03', 'Stay within static source', 'HTML, CSS, and small client-side interactions'],
];

export function BuilderUpgradeV3() {
  const [mode, setMode] = useState<Mode>('Build');
  const [activeFile, setActiveFile] = useState('index.html');
  const [files, setFiles] = useState(starterFiles);
  const [selectedProject, setSelectedProject] = useState(projects[0].name);
  const [showHistory, setShowHistory] = useState(false);
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [approval, setApproval] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<'Ready' | 'Refreshed'>('Ready');
  const [checksRun, setChecksRun] = useState(false);
  const [toast, setToast] = useState('');
  const [prompt, setPrompt] = useState('Build a calm, editorial journal for a small creative studio. Help people collect field notes, surface recent observations, and return to unfinished ideas.');
  const [search, setSearch] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const currentFile = useMemo(() => files.find((file) => file.name === activeFile) ?? files[0], [files, activeFile]);
  const previewDocument = useMemo(() => {
    const html = files.find((file) => file.name === 'index.html')?.content ?? '';
    const css = files.find((file) => file.name === 'styles.css')?.content ?? '';
    const js = files.find((file) => file.name === 'app.js')?.content ?? '';
    return html
      .replace('<link rel="stylesheet" href="styles.css" />', `<style>${css}</style>`)
      .replace('</body>', `<script>${js}</script></body>`);
  }, [files]);
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function updateCode(content: string) {
    setFiles((current) => current.map((file) => file.name === activeFile ? { ...file, content } : file));
  }

  function addSourceFile() {
    if (files.some((file) => file.name === 'notes.md')) {
      setActiveFile('notes.md');
      notify('notes.md is already in this project.');
      return;
    }
    setFiles((current) => [...current, { name: 'notes.md', language: 'Markdown', content: '# Fieldnotes journal\\n\\nProject decisions\\n- Keep the surface quiet and readable\\n- Use small, inspectable interactions\\n- No remote services in this prototype\\n' }]);
    setActiveFile('notes.md');
  }

  function downloadSource() {
    const bundle = files.map((file) => `/* ${file.name} */\\n${file.content}`).join('\\n\\n');
    const blob = new Blob([bundle], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fieldnotes-source-bundle.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Local source bundle downloaded. ZIP packaging is a planned control.');
  }

  return (
    <div className="tinanai-v3 min-h-screen">
      <style>{`
        .tinanai-v3{--ink:#e5e8df;--soft:#a7b1a6;--muted:#7b877e;--bg:#171d1a;--panel:#202824;--panel2:#242d28;--line:#354039;--mint:#b6d4bd;--mint-dark:#2c493a;--orange:#d39a72;--amber:#d3b777;min-height:100dvh;background:radial-gradient(ellipse at 52% -18%,#334239 0%,transparent 47%),#171d1a;color:var(--ink);font-family:var(--app-font-sans,Manrope,sans-serif);font-size:12px;overflow-x:hidden}
        .tinanai-v3 *{box-sizing:border-box}.tinanai-v3 button,.tinanai-v3 textarea{font:inherit}.tv-shell{max-width:1680px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column}.tv-topbar{height:58px;border-bottom:1px solid #303a33;display:flex;align-items:center;padding:0 22px;gap:22px;background:#1b221e}.tv-brand{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.04em;color:#f0f2e9;font-size:14px;white-space:nowrap}.tv-brandmark{display:grid;place-items:center;width:25px;height:25px;background:#cad9c6;color:#26372c;border-radius:7px;font-size:14px;font-weight:900}.tv-brand small{font-size:9px;color:#849086;font-weight:600;letter-spacing:.08em;margin-left:3px}.tv-project-crumb{display:flex;align-items:center;gap:8px;color:#87938a;font-size:11px}.tv-project-crumb strong{color:#e1e5dc;font-weight:650}.tv-top-spacer{flex:1}.tv-branch{display:flex;gap:6px;align-items:center;color:#aab5aa;border:1px solid #39443c;padding:6px 9px;border-radius:6px;font-size:10px}.tv-top-icon,.tv-iconbtn{display:grid;place-items:center;border:1px solid transparent;background:transparent;color:#a8b4aa;width:30px;height:30px;border-radius:6px;cursor:pointer;transition:background .18s,color .18s,transform .18s}.tv-top-icon:hover,.tv-iconbtn:hover{background:#303a33;color:#eef1e9;transform:translateY(-1px)}.tv-user{width:26px;height:26px;border-radius:50%;background:#b58d6c;color:#1d241f;display:grid;place-items:center;font-size:9px;font-weight:800}.tv-toolbar{display:flex;align-items:center;gap:8px;padding:12px 22px;border-bottom:1px solid #2b352e;background:#1b221e}.tv-breadcrumb{display:flex;align-items:center;gap:7px;color:#7d8a80;font-size:10px}.tv-breadcrumb b{color:#e1e5dd;font-weight:650}.tv-toolbar-right{margin-left:auto;display:flex;align-items:center;gap:7px}.tv-btn{border:1px solid #3a473e;background:#242d28;color:#cad2c7;padding:7px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:10px;font-weight:650;white-space:nowrap;transition:background .16s,border-color .16s,transform .16s}.tv-btn:hover{background:#303b34;border-color:#526456;transform:translateY(-1px)}.tv-btn.primary{background:#c1d7c0;color:#1d2a21;border-color:#c1d7c0}.tv-btn.primary:hover{background:#d2e3cf}.tv-btn.ghost{background:transparent}.tv-btn.small{padding:6px 8px;font-size:9px}.tv-btn:disabled{opacity:.42;cursor:not-allowed;transform:none}.tv-env{color:#9ba89c;font-size:9px;display:flex;align-items:center;gap:5px;padding:0 8px}.tv-env i,.tv-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9ec9a7}.tv-workspace{display:grid;grid-template-columns:220px minmax(390px,1fr) 310px;flex:1;min-height:0}.tv-left{border-right:1px solid #303a33;background:#1a211d;padding:13px 10px;min-width:0}.tv-main{min-width:0;padding:15px 16px 12px;display:flex;flex-direction:column;gap:12px}.tv-right{border-left:1px solid #303a33;background:#1a211d;padding:14px 12px;min-width:0}.tv-sidebar-head{display:flex;align-items:center;justify-content:space-between;padding:3px 5px 12px}.tv-label{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:#849187;font-weight:800}.tv-search{height:29px;display:flex;gap:7px;align-items:center;border:1px solid #354139;background:#202823;border-radius:5px;padding:0 8px;color:#89958b;margin-bottom:10px}.tv-search input{width:100%;border:0;outline:0;background:none;color:#dfe5da;font-size:10px}.tv-search input::placeholder{color:#727f75}.tv-project-list{display:flex;flex-direction:column;gap:3px}.tv-project-row{width:100%;display:flex;align-items:center;gap:9px;border:1px solid transparent;color:#aab5aa;background:transparent;border-radius:6px;padding:8px 7px;text-align:left;cursor:pointer;transition:background .15s,border-color .15s}.tv-project-row:hover{background:#252e28}.tv-project-row.active{background:#2a372e;border-color:#425247;color:#e2e9dd}.tv-project-glyph{width:25px;height:25px;border-radius:6px;display:grid;place-items:center;flex:none;color:#36453a;background:#c5d6c5}.tv-project-glyph.gold{background:#dfcfaa;color:#675638}.tv-project-glyph.blue{background:#b8c9cb;color:#3f5d60}.tv-project-glyph.rose{background:#d9b9ad;color:#704a41}.tv-project-info{min-width:0;flex:1}.tv-project-info b{display:block;font-size:10px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-project-info small{display:block;margin-top:3px;font-size:8px;color:#819087;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-project-count{color:#758379;font:9px var(--app-font-mono,monospace)}.tv-sidebar-section{margin-top:19px;padding-top:13px;border-top:1px solid #303a33}.tv-sidebar-section .tv-label{padding:0 5px 8px}.tv-shortcut{display:flex;align-items:center;gap:8px;padding:7px 6px;color:#9eaaa0;font-size:9px}.tv-shortcut svg{color:#829087}.tv-contract{margin-top:17px;border:1px solid #39443d;border-radius:7px;padding:10px;background:#202823}.tv-contract strong{display:flex;align-items:center;gap:6px;font-size:9px;color:#c4cec2}.tv-contract p{font-size:8px;line-height:1.55;color:#839087;margin:7px 0 0}.tv-contract em{font-style:normal;color:#d8bd80}.tv-panel{border:1px solid #343f37;background:linear-gradient(140deg,#222b25,#1e2621);border-radius:8px;overflow:hidden}.tv-editor-panel{flex:1;min-height:390px;display:flex;flex-direction:column}.tv-panel-head{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #323d35;min-height:44px}.tv-panel-head h2{margin:0;font-size:11px;font-weight:700;letter-spacing:-.01em}.tv-panel-head .sub{font-size:9px;color:#829087}.tv-head-spacer{flex:1}.tv-tabs{display:flex;align-items:center;gap:3px}.tv-tab{border:0;background:none;color:#839087;padding:6px 9px;border-radius:5px;font-size:9px;cursor:pointer}.tv-tab.active{background:#35433a;color:#d8e3d6}.tv-filetabs{display:flex;gap:1px;align-items:center;padding:0 10px;border-bottom:1px solid #323d35;background:#1c241f;overflow:auto}.tv-filetab{display:flex;align-items:center;gap:6px;padding:9px 10px;color:#87948a;font:9px var(--app-font-mono,monospace);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}.tv-filetab.active{color:#dce4d8;border-color:#b6d4bd;background:#252e28}.tv-filetab svg{color:#8fbd9a}.tv-editor-toolbar{display:flex;align-items:center;padding:7px 11px;gap:9px;color:#7c8b80;font-size:9px;border-bottom:1px solid #2e3931}.tv-editor-toolbar .spacer{flex:1}.tv-editor-body{display:grid;grid-template-columns:42px minmax(0,1fr);flex:1;min-height:280px;background:#171e1a;overflow:auto}.tv-lines{padding:11px 9px 12px 0;text-align:right;color:#57665b;font:9px/1.75 var(--app-font-mono,monospace);user-select:none;white-space:pre}.tv-editor-body textarea{display:block;width:100%;min-width:500px;resize:none;outline:0;border:0;background:transparent;color:#d4dcd1;padding:11px 14px 18px 0;font:9px/1.75 var(--app-font-mono,monospace);tab-size:2;white-space:pre;overflow:visible}.tv-editor-status{display:flex;align-items:center;gap:13px;padding:6px 10px;border-top:1px solid #2f3932;background:#1c241f;color:#7c8b80;font:8px var(--app-font-mono,monospace)}.tv-editor-status span:last-child{margin-left:auto}.tv-diff{color:#91cda0}.tv-bottom-grid{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px}.tv-preview-panel{min-width:0}.tv-preview-frame{height:240px;margin:10px;background:#f7f6f0;border-radius:4px;overflow:hidden;position:relative}.tv-preview-frame iframe{width:100%;height:100%;border:0;background:#f7f6f0}.tv-preview-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:7px;background:#f7f6f0;color:#39483d;font-family:Georgia,serif}.tv-preview-cover b{font-size:18px;font-weight:400}.tv-preview-cover small{font:9px var(--app-font-sans,Manrope,sans-serif);color:#7b887c}.tv-checks{padding:10px 12px}.tv-check-item{display:flex;gap:8px;padding:10px 0;border-bottom:1px solid #303a33}.tv-check-item:last-child{border-bottom:0}.tv-check-icon{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:#2a4937;color:#a7d5b0;flex:none}.tv-check-icon.pending{background:#39352a;color:#d7c080}.tv-check-item b{display:block;font-size:9px;font-weight:650}.tv-check-item small{display:block;color:#849087;font-size:8px;line-height:1.5;margin-top:3px}.tv-check-summary{margin-top:9px;color:#d4c28c;background:#393429;padding:8px;border-radius:5px;font-size:8px;line-height:1.55}.tv-ai-title{display:flex;align-items:center;gap:7px;font-weight:700;font-size:11px}.tv-ai-title svg{color:#c0d4b8}.tv-agent-badge{margin-left:auto;border:1px solid #445046;background:#2a342c;color:#b9c8b7;border-radius:4px;padding:4px 6px;font-size:8px}.tv-mode-row{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:12px 0}.tv-mode{border:1px solid #3b453e;background:#222a25;color:#849087;border-radius:5px;padding:7px 4px;cursor:pointer;font-size:9px}.tv-mode.active{background:#39483c;border-color:#6f8c72;color:#e0eadc}.tv-prompt-label{display:flex;align-items:center;justify-content:space-between;font-size:9px;font-weight:650;color:#c3ccc0;margin-bottom:6px}.tv-prompt-label small{font-size:8px;color:#7f8b81;font-weight:400}.tv-prompt{background:#202823;border:1px solid #3a453d;border-radius:6px;color:#cad3c7;width:100%;min-height:92px;resize:vertical;padding:9px;font-size:9px;line-height:1.55;outline:0}.tv-prompt:focus{border-color:#758e75}.tv-agent-actions{display:flex;gap:6px;margin-top:8px}.tv-agent-actions .tv-btn{flex:1;justify-content:center}.tv-plan{margin-top:13px;border-top:1px solid #354038;padding-top:12px}.tv-plan-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.tv-plan-head strong{font-size:9px}.tv-plan-head span{font-size:8px;color:#a8c5a9}.tv-plan-item{display:grid;grid-template-columns:19px 1fr;gap:7px;padding:7px 0;border-bottom:1px solid #2e3831}.tv-plan-item:last-child{border-bottom:0}.tv-plan-num{color:#849482;font:8px var(--app-font-mono,monospace);padding-top:1px}.tv-plan-item b{font-size:8px;font-weight:650;color:#d2dbd0;display:block}.tv-plan-item small{display:block;margin-top:3px;color:#7d8a80;font-size:8px;line-height:1.45}.tv-approval{margin-top:10px;border:1px solid #66583b;background:#302d24;border-radius:6px;padding:9px}.tv-approval-title{display:flex;align-items:center;gap:6px;color:#dfc989;font-weight:700;font-size:9px}.tv-approval p{color:#b2a77f;font-size:8px;line-height:1.5;margin:6px 0}.tv-approval button{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #76663f;color:#e2d29c;background:#403b2d;border-radius:4px;padding:6px;cursor:pointer;font-size:8px}.tv-approval button.approved{background:#294537;border-color:#4d7358;color:#c2e0c4}.tv-github{display:flex;align-items:center;gap:8px;padding:9px;margin-top:11px;border:1px solid #364139;border-radius:6px;background:#202823}.tv-github-icon{width:25px;height:25px;border-radius:6px;display:grid;place-items:center;color:#c7d0c4;background:#2e3831}.tv-github b{display:block;font-size:8px}.tv-github small{display:block;margin-top:3px;color:#8c988e;font-size:8px}.tv-github-status{margin-left:auto;color:#d4bb7d;font-size:8px;white-space:nowrap}.tv-github-note{font-size:8px;line-height:1.5;color:#7f8b81;margin:7px 2px 0}.tv-session{margin-top:13px;border-top:1px solid #303a33;padding-top:11px}.tv-session-head{display:flex;align-items:center;justify-content:space-between;color:#859188;font-size:8px}.tv-session-head b{color:#b3beb3;font-weight:600}.tv-session-row{display:flex;gap:8px;align-items:center;padding-top:9px;font-size:8px;color:#a2ada2}.tv-session-row svg{color:#89998c}.tv-session-row small{margin-left:auto;color:#79867c}.tv-statusbar{height:27px;border-top:1px solid #303a33;background:#1b221e;display:flex;align-items:center;gap:13px;padding:0 15px;color:#7e8b81;font:8px var(--app-font-mono,monospace)}.tv-statusbar .ok{color:#a8c9a9}.tv-statusbar span:last-child{margin-left:auto}.tv-modal-backdrop{position:fixed;inset:0;z-index:20;background:#101612bb;display:grid;place-items:center;padding:20px;backdrop-filter:blur(3px)}.tv-modal{width:min(480px,100%);border:1px solid #465349;background:#202823;border-radius:10px;box-shadow:0 24px 80px #0008;overflow:hidden}.tv-modal-head{display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid #364139}.tv-modal-head h3{font-size:12px;margin:0;flex:1}.tv-modal-body{padding:16px;color:#aab5a9;font-size:10px;line-height:1.65}.tv-history-row{display:flex;align-items:center;gap:9px;border-bottom:1px solid #354038;padding:10px 0}.tv-history-row:last-child{border:0}.tv-history-row b{color:#d9e1d6;font-size:9px}.tv-history-row small{display:block;color:#829087;font-size:8px;margin-top:3px}.tv-history-row time{margin-left:auto;color:#829087;font-size:8px}.tv-modal-foot{padding:12px 16px;border-top:1px solid #364139;display:flex;justify-content:flex-end;gap:7px}.tv-toast{position:fixed;z-index:30;bottom:42px;left:50%;transform:translateX(-50%);border:1px solid #53634f;border-radius:7px;background:#29372d;color:#dfe9da;padding:10px 14px;font-size:10px;box-shadow:0 12px 30px #0006;animation:tvIn .2s ease-out}@keyframes tvIn{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}.tv-caveat{font-size:8px;line-height:1.5;color:#77847a;padding:0 2px;margin-top:9px}.tv-empty{padding:16px;color:#829087;font-size:9px}.tv-toggle{display:flex;align-items:center;gap:7px;color:#aab5aa;font-size:8px;margin-top:9px;cursor:pointer}.tv-toggle input{accent-color:#bad2b7}
        @media(max-width:1180px){.tv-workspace{grid-template-columns:190px minmax(350px,1fr)}.tv-right{grid-column:1/-1;border-left:0;border-top:1px solid #303a33;display:grid;grid-template-columns:1fr 1fr;gap:15px;padding:14px}.tv-ai-panel{grid-row:span 2}.tv-session{margin-top:0;border-top:0;padding-top:0}.tv-contract{margin-top:10px}.tv-bottom-grid{grid-template-columns:minmax(0,1fr) 240px}}
        @media(max-width:760px){.tv-topbar{padding:0 12px;gap:10px}.tv-project-crumb,.tv-branch,.tv-topbar .tv-hide-mobile{display:none}.tv-toolbar{padding:9px 12px;overflow:auto}.tv-toolbar-right{gap:4px}.tv-workspace{grid-template-columns:1fr}.tv-left{border-right:0;border-bottom:1px solid #303a33;padding:9px 12px}.tv-left .tv-search,.tv-sidebar-section,.tv-contract{display:none}.tv-sidebar-head{padding:2px 2px 8px}.tv-project-list{flex-direction:row;overflow:auto}.tv-project-row{width:auto;min-width:145px}.tv-main{padding:12px}.tv-right{grid-column:auto;display:flex;flex-direction:column;padding:12px;border-left:0}.tv-bottom-grid{grid-template-columns:1fr}.tv-preview-frame{height:220px}.tv-editor-panel{min-height:330px}.tv-toolbar .tv-breadcrumb{white-space:nowrap}.tv-toolbar-right .tv-btn:not(.primary){padding:7px}.tv-env{display:none}}
        @media(max-width:450px){.tv-topbar{height:52px}.tv-brand small{display:none}.tv-topbar .tv-top-icon{display:none}.tv-toolbar-right .tv-btn{font-size:0;gap:0;padding:8px}.tv-toolbar-right .tv-btn svg{width:14px;height:14px}.tv-editor-toolbar{gap:5px}.tv-editor-toolbar .tv-hide-mobile{display:none}.tv-filetabs{padding:0 5px}.tv-filetab{padding:9px 7px}.tv-statusbar{gap:7px;padding:0 8px}.tv-statusbar .hide-small{display:none}}
      `}</style>
      <div className="tv-shell">
        <header className="tv-topbar">
          <div className="tv-brand"><span className="tv-brandmark">t</span> TINANAI <small>BUILDER</small></div>
          <div className="tv-project-crumb"><span>Workspace</span><ArrowRight size={12} /><strong>{selectedProject}</strong><ChevronDown size={12} /></div>
          <div className="tv-top-spacer" />
          <div className="tv-branch"><GitBranch size={12} /> local-workspace <ChevronDown size={11} /></div>
          <button className="tv-top-icon tv-hide-mobile" aria-label="Search" onClick={() => document.getElementById('project-search')?.focus()}><Search size={15} /></button>
          <button className="tv-top-icon tv-hide-mobile" aria-label="Settings" onClick={() => notify('Workspace preferences are a concept control.')}><Settings2 size={15} /></button>
          <span className="tv-user" title="Avery Morgan">AM</span>
        </header>
        <div className="tv-toolbar">
          <div className="tv-breadcrumb"><span>Projects</span><ArrowRight size={11} /><b>{selectedProject}</b><span className="tv-dot" /></div>
          <div className="tv-toolbar-right">
            <span className="tv-env"><Circle size={8} /> Browser-local</span>
            <button className="tv-btn ghost" onClick={() => setShowHistory(true)}><History size={13} /> History</button>
            <button className="tv-btn ghost" onClick={() => notify('GitHub is not connected in this prototype.')}><GitBranch size={13} /> GitHub</button>
            <button className="tv-btn" onClick={downloadSource}><ArrowDownToLine size={13} /> Export</button>
            <button className="tv-btn primary" onClick={() => { setShowCheckpoint(true); setApproval(false); }}><ShieldCheck size={13} /> Review changes</button>
          </div>
        </div>
        <div className="tv-workspace">
          {leftOpen && <aside className="tv-left">
            <div className="tv-sidebar-head"><span className="tv-label">Your workspace</span><button className="tv-iconbtn" aria-label="Collapse project panel" onClick={() => setLeftOpen(false)}><PanelLeftClose size={14} /></button></div>
            <label className="tv-search"><Search size={13} /><input id="project-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a project…" /></label>
            <div className="tv-project-list">
              {visibleProjects.map((project) => <button key={project.name} className={`tv-project-row ${selectedProject === project.name ? 'active' : ''}`} onClick={() => { setSelectedProject(project.name); notify(`${project.name} opened in this concept workspace.`); }}>
                <span className={`tv-project-glyph ${project.color}`}><Layers3 size={13} /></span>
                <span className="tv-project-info"><b>{project.name}</b><small>{project.detail}</small></span><span className="tv-project-count">{project.files}</span>
              </button>)}
              {visibleProjects.length === 0 && <div className="tv-empty">No projects match that search.</div>}
            </div>
            <button className="tv-btn small" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => notify('New project creation is shown as a concept control.')}><Plus size={12} /> New project</button>
            <div className="tv-sidebar-section">
              <div className="tv-label">Workspace tools</div>
              <div className="tv-shortcut"><Clock3 size={13} /> Recent activity</div>
              <div className="tv-shortcut"><FolderGit2 size={13} /> Source snapshots</div>
              <div className="tv-shortcut"><LockKeyhole size={13} /> Privacy &amp; access</div>
            </div>
            <div className="tv-contract">
              <strong><ShieldCheck size={13} /> Contract awareness <em>CONCEPT</em></strong>
              <p>Structured review checkpoints are pictured here. This prototype does <b>not</b> claim EUREKA CORE Builder Contract v1.1 compatibility.</p>
            </div>
          </aside>}
          <main className="tv-main">
            {!leftOpen && <button className="tv-btn small" onClick={() => setLeftOpen(true)}><PanelLeftClose size={12} /> Projects</button>}
            <section className="tv-panel tv-editor-panel">
              <div className="tv-panel-head">
                <Code2 size={15} color="#b9d5bd" />
                <h2>Source workspace</h2>
                <span className="sub">Inspect and edit project files</span>
                <span className="tv-head-spacer" />
                <button className="tv-btn small tv-hide-mobile" onClick={() => setShowHistory(true)}><History size={12} /> Snapshot</button>
                <button className="tv-btn small" onClick={addSourceFile}><FilePlus2 size={12} /> Add file</button>
              </div>
              <div className="tv-filetabs" role="tablist" aria-label="Source files">
                {files.map((file) => <button key={file.name} className={`tv-filetab ${activeFile === file.name ? 'active' : ''}`} role="tab" aria-selected={activeFile === file.name} onClick={() => setActiveFile(file.name)}><FileCode2 size={12} />{file.name}</button>)}
              </div>
              <div className="tv-editor-toolbar">
                <span>{currentFile.language}</span><span>/</span><span>{currentFile.name}</span>
                <span className="spacer" />
                <span className="tv-hide-mobile">UTF-8</span><span className="tv-hide-mobile">Spaces: 2</span>
                <button className="tv-iconbtn" aria-label="Copy source" onClick={() => { void navigator.clipboard?.writeText(currentFile.content); notify('Source copied to clipboard.'); }}><Copy size={12} /></button>
                <button className="tv-iconbtn" aria-label="Download current file" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([currentFile.content], { type: 'text/plain' })); link.download = currentFile.name; link.click(); URL.revokeObjectURL(link.href); }}><Download size={12} /></button>
              </div>
              <div className="tv-editor-body">
                <div className="tv-lines" aria-hidden="true">{Array.from({ length: currentFile.content.split('\n').length }, (_, index) => index + 1).join('\n')}</div>
                <textarea aria-label={`${currentFile.name} source editor`} spellCheck={false} value={currentFile.content} onChange={(event) => updateCode(event.target.value)} />
              </div>
              <div className="tv-editor-status"><span><span className="tv-dot" /> Saved locally</span><span>Ln {currentFile.content.split('\n').length}, Col 1</span><span className="tv-diff">● working tree</span></div>
            </section>
            <div className="tv-bottom-grid">
              <section className="tv-panel tv-preview-panel">
                <div className="tv-panel-head"><Play size={13} color="#b9d5bd" /><h2>Preview</h2><span className="sub">Static HTML · CSS · JavaScript</span><span className="tv-head-spacer" /><span className="tv-status-pill" style={{ color: '#a9c9ad', fontSize: 8 }}>● {previewStatus}</span><button className="tv-btn small" onClick={() => { setPreviewStatus('Refreshed'); setTimeout(() => setPreviewStatus('Ready'), 1500); notify('Preview refresh requested. Static content only.'); }}><RefreshCw size={12} /> Refresh</button></div>
                <div className="tv-preview-frame">
                  <iframe title="Static Fieldnotes preview" srcDoc={previewDocument} sandbox="allow-scripts" />
                </div>
                <div className="tv-caveat" style={{ padding: '0 11px 11px' }}>Only static HTML/CSS/JS runs in this preview. The iframe has no CPU or memory quotas. Browser isolation is not a process boundary.</div>
              </section>
              <section className="tv-panel tv-checks">
                <div className="tv-panel-head" style={{ padding: '0 0 9px', minHeight: 'auto', border: 0 }}><Activity size={13} color="#b9d5bd" /><h2>Checks</h2><span className="tv-head-spacer" /><button className="tv-iconbtn" aria-label="Run checks" onClick={() => { setChecksRun(true); notify('Static checks and basic iframe load check completed.'); }}><RefreshCw size={12} /></button></div>
                <div className="tv-check-item"><span className={`tv-check-icon ${checksRun ? '' : 'pending'}`}>{checksRun ? <Check size={11} /> : <Clock3 size={11} />}</span><div><b>Static source checks</b><small>{checksRun ? 'Paths and local references look reasonable.' : 'Inspect entry file, paths, and local references.'}</small></div></div>
                <div className="tv-check-item"><span className={`tv-check-icon ${checksRun ? '' : 'pending'}`}>{checksRun ? <Check size={11} /> : <Clock3 size={11} />}</span><div><b>Basic iframe load</b><small>{checksRun ? 'Initial preview frame loaded.' : 'One initial load check; no exhaustive tests.'}</small></div></div>
                {checksRun && <div className="tv-check-summary">2 checks complete · no full build or exhaustive test suite was run.</div>}
                <button className="tv-btn small" style={{ width: '100%', justifyContent: 'center', marginTop: 9 }} onClick={() => { setChecksRun(true); notify('Static checks finished. Report is available as a concept.'); }}><CheckCheck size={12} /> Run checks</button>
              </section>
            </div>
            <section className="tv-panel" style={{ display: terminalOpen ? 'block' : 'none' }}>
              <div className="tv-panel-head"><Terminal size={13} /><h2>Session output</h2><span className="tv-head-spacer" /><button className="tv-iconbtn" aria-label="Close output" onClick={() => setTerminalOpen(false)}><X size={13} /></button></div>
              <div style={{ padding: 12, color: '#94a294', font: '9px/1.7 var(--app-font-mono, monospace)' }}>No server process. Static preview only.\\nChecks are limited to source inspection and one basic iframe load.</div>
            </section>
          </main>
          <aside className="tv-right">
            <section className="tv-ai-panel">
              <div className="tv-ai-title"><WandSparkles size={15} /> Agent workspace <span className="tv-agent-badge">CONCEPT</span></div>
              <div className="tv-mode-row" aria-label="Agent mode">
                {(['Plan', 'Build', 'Repair'] as Mode[]).map((item) => <button key={item} className={`tv-mode ${mode === item ? 'active' : ''}`} onClick={() => setMode(item)}>{item === 'Plan' ? <Layers3 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : item === 'Build' ? <Code2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : <RefreshCw size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />}{item}</button>)}
              </div>
              <label className="tv-prompt-label" htmlFor="agent-prompt"><span>{mode === 'Plan' ? 'Planning brief' : mode === 'Repair' ? 'Repair request' : 'Build instruction'}</span><small>{prompt.length} chars</small></label>
              <textarea id="agent-prompt" className="tv-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <div className="tv-agent-actions">
                <button className="tv-btn primary" onClick={() => { if (mode === 'Plan') notify('Plan updated for review. No source was changed.'); else { setShowCheckpoint(true); setApproval(false); } }}><Sparkles size={12} />{mode === 'Plan' ? 'Draft plan' : mode === 'Repair' ? 'Propose repair' : 'Propose build'}</button>
                <button className="tv-btn" aria-label="More agent options" onClick={() => setShowMenu(!showMenu)}><ChevronDown size={12} /></button>
              </div>
              {showMenu && <div style={{ marginTop: 7, border: '1px solid #3a453d', borderRadius: 5, padding: 8, color: '#9eaa9f', fontSize: 8, lineHeight: 1.8 }}>Model selection · source context · safety rules are planned controls, not connected services.</div>}
              <div className="tv-plan">
                <div className="tv-plan-head"><strong>{mode === 'Repair' ? 'Repair proposal' : 'Current plan'}</strong><span>3 steps · reviewable</span></div>
                {planItems.map(([num, title, detail]) => <div className="tv-plan-item" key={num}><span className="tv-plan-num">{num}</span><div><b>{title}</b><small>{detail}</small></div></div>)}
              </div>
              <div className="tv-approval">
                <div className="tv-approval-title"><AlertTriangle size={12} /> Human review checkpoint</div>
                <p>Review the proposed diff and approve explicitly before any source change. Nothing deploys automatically.</p>
                <button className={approval ? 'approved' : ''} onClick={() => setShowCheckpoint(true)}>{approval ? <Check size={11} /> : <ShieldCheck size={11} />}{approval ? 'Approval recorded for this mockup' : 'Open review & approval'}</button>
              </div>
            </section>
            <section>
              <div className="tv-github"><span className="tv-github-icon"><GitBranch size={14} /></span><div><b>GitHub connection</b><small>Repository access</small></div><span className="tv-github-status">Not connected</span></div>
              <p className="tv-github-note">Connection, sync, and push are planned controls only. No GitHub integration is active in this prototype.</p>
            </section>
            <section className="tv-session">
              <div className="tv-session-head"><b>PROJECT ACTIVITY</b><button className="tv-iconbtn" aria-label="Show session output" onClick={() => setTerminalOpen(!terminalOpen)}><Terminal size={12} /></button></div>
              <div className="tv-session-row"><Clock3 size={12} /><span>Last saved to browser</span><small>just now</small></div>
              <div className="tv-session-row"><History size={12} /><span>Source snapshot</span><small>v1 · 4 min</small></div>
              <div className="tv-session-row"><LockKeyhole size={12} /><span>Workspace scope</span><small>local</small></div>
            </section>
          </aside>
        </div>
        <footer className="tv-statusbar"><span className="ok">● local workspace</span><span className="hide-small">HTML · CSS · JS</span><span className="hide-small">No backend execution</span><span>Builder concept</span><span>Approvals explicit</span></footer>
      </div>
      {showHistory && <div className="tv-modal-backdrop" role="presentation" onClick={() => setShowHistory(false)}><section className="tv-modal" role="dialog" aria-modal="true" aria-label="Source history" onClick={(event) => event.stopPropagation()}>
        <div className="tv-modal-head"><History size={15} color="#bfd5bd" /><h3>Source history</h3><button className="tv-iconbtn" aria-label="Close history" onClick={() => setShowHistory(false)}><X size={14} /></button></div>
        <div className="tv-modal-body">
          {[['Current working copy', 'HTML, CSS and JS · saved in this browser', 'Now'], ['Initial project scaffold', 'Created from the studio journal brief', '4 min ago'], ['Prompt revision', 'Adjusted tone to editorial and calm', '11 min ago']].map(([title, detail, time]) => <div className="tv-history-row" key={title}><span className="tv-check-icon"><History size={11} /></span><div><b>{title}</b><small>{detail}</small></div><time>{time}</time></div>)}
          <p className="tv-caveat">History and restore are concept UI in this static prototype; no remote version store is connected.</p>
        </div>
        <div className="tv-modal-foot"><button className="tv-btn" onClick={() => setShowHistory(false)}>Close</button><button className="tv-btn primary" onClick={() => { setShowHistory(false); notify('Restore is a planned control; no source was changed.'); }}>Restore selected</button></div>
      </section></div>}
      {showCheckpoint && <div className="tv-modal-backdrop" role="presentation" onClick={() => setShowCheckpoint(false)}><section className="tv-modal" role="dialog" aria-modal="true" aria-label="Review and approve changes" onClick={(event) => event.stopPropagation()}>
        <div className="tv-modal-head"><ShieldCheck size={15} color="#d9c17e" /><h3>Review proposed source changes</h3><button className="tv-iconbtn" aria-label="Close review" onClick={() => setShowCheckpoint(false)}><X size={14} /></button></div>
        <div className="tv-modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d8e4d5', marginBottom: 10 }}><Code2 size={13} /> <b>Proposal: refine the studio journal</b><span style={{ marginLeft: 'auto', color: '#9fc4a3' }}>+18 / −4 lines</span></div>
          <p>This checkpoint represents a human-controlled review step. Inspect the files in the editor before deciding. The prototype does not apply AI-generated changes or deploy anything.</p>
          <div style={{ background: '#171e1a', border: '1px solid #364139', borderRadius: 5, padding: 10, color: '#a6b4a4', font: '9px/1.7 var(--app-font-mono, monospace)' }}><span style={{ color: '#8ec797' }}>+ </span> Preserve the calm editorial hierarchy<br /><span style={{ color: '#8ec797' }}>+ </span> Keep interactions in local static source<br /><span style={{ color: '#d8a07c' }}>− </span> No generated file changes have been applied</div>
          <label className="tv-toggle"><input type="checkbox" checked={approval} onChange={(event) => setApproval(event.target.checked)} /> I reviewed the proposal and explicitly approve this concept checkpoint.</label>
          <p className="tv-caveat">Approval here is demonstrative only. This prototype does not claim EUREKA CORE Builder Contract v1.1 compatibility, run a full build, or publish/deploy changes.</p>
        </div>
        <div className="tv-modal-foot"><button className="tv-btn" onClick={() => setShowCheckpoint(false)}>Keep reviewing</button><button className="tv-btn primary" disabled={!approval} onClick={() => { setShowCheckpoint(false); notify('Explicit approval recorded in this visual prototype. No source was deployed.'); }}>Approve checkpoint</button></div>
      </section></div>}
      {toast && <div className="tv-toast" role="status">{toast}</div>}
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}><Command /> {selectedProject}</span>
    </div>
  );
}
