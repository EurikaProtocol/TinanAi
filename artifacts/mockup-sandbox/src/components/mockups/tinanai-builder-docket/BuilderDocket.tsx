import { useState } from 'react';
import {
  Activity, ArrowRight, Check, CheckCircle2, ChevronDown, Circle,
  Clock3, Code2, FileCode2, FileText, GitBranch, History, LockKeyhole,
  MessageSquare, MoreHorizontal, Plus, ShieldCheck, Sparkles,
  X,
} from 'lucide-react';

type Proposal = { title: string; subtitle: string; status: 'Needs review' | 'Approved' | 'Draft'; time: string };

const proposals: Proposal[] = [
  { title: 'Journal landing page', subtitle: 'Fieldnotes journal · 3 files', status: 'Needs review', time: '2 min ago' },
  { title: 'Map filter refinements', subtitle: 'Civic atlas · 2 files', status: 'Draft', time: 'Yesterday' },
  { title: 'Recipe index polish', subtitle: 'Recipe archive · 1 file', status: 'Approved', time: 'May 16' },
];

const diffRows = [
  { file: 'index.html', kind: 'HTML', title: 'Give recent notes clearer context', detail: 'Adds a short category label and reading time beside each journal entry.', additions: '+12', removals: '−3' },
  { file: 'styles.css', kind: 'CSS', title: 'Increase contrast on quiet text', detail: 'Raises secondary text contrast while keeping the paper-and-sage palette.', additions: '+8', removals: '−2' },
  { file: 'app.js', kind: 'JS', title: 'Keep navigation local', detail: 'Preserves the current in-page navigation behavior; no network calls added.', additions: '+4', removals: '−1' },
];

export function BuilderDocket() {
  const [active, setActive] = useState(0);
  const [approved, setApproved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>('index.html');
  const [toast, setToast] = useState('');
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [checks, setChecks] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  const selected = proposals[active];
  const canApprove = checks && selected.status !== 'Approved';

  return (
    <div className="bd-root">
      <style>{`
        .bd-root{--paper:#f3f0e8;--surface:#fbfaf6;--ink:#292b27;--muted:#77796f;--line:#e2ded4;--sage:#526c5b;--sage-soft:#e6ece3;--amber:#ad7742;--amber-soft:#f3eadc;--rose:#a65a49;min-height:100dvh;background:var(--paper);color:var(--ink);font-family:var(--app-font-sans,'DM Sans',sans-serif);font-size:13px}
        .bd-root *{box-sizing:border-box}.bd-root button,.bd-root input,.bd-root textarea{font:inherit}.bd-app{max-width:1600px;margin:auto;min-height:100dvh;display:flex;flex-direction:column}
        .bd-top{height:61px;display:flex;align-items:center;padding:0 27px;background:#fcfbf7;border-bottom:1px solid var(--line);gap:20px}
        .bd-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:800;letter-spacing:-.045em;white-space:nowrap}.bd-mark{width:27px;height:27px;display:grid;place-items:center;background:#dce5d8;color:#49614f;border-radius:8px}.bd-crumb{color:#98978d;display:flex;align-items:center;gap:8px;font-size:11px}.bd-crumb b{font-weight:600;color:#52544c}.bd-top-spacer{flex:1}.bd-live{display:flex;align-items:center;gap:7px;color:#77796f;font-size:10px}.bd-live i{width:7px;height:7px;border-radius:50%;background:#76967c;box-shadow:0 0 0 3px #e5eee3}.bd-avatar{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#e9ded0;color:#795f45;font-size:10px;font-weight:700}
        .bd-layout{display:grid;grid-template-columns:246px minmax(440px,1fr) 302px;min-height:calc(100dvh - 99px);flex:1}
        .bd-rail{background:#f7f5ef;border-right:1px solid var(--line);padding:21px 14px 18px;display:flex;flex-direction:column}
        .bd-rail-title{display:flex;justify-content:space-between;align-items:center;padding:0 10px 12px;color:#89897e;font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}.bd-round{width:25px;height:25px;border:1px solid var(--line);border-radius:7px;background:transparent;display:grid;place-items:center;color:#74766d;cursor:pointer}
        .bd-proposal{width:100%;border:0;text-align:left;padding:12px 10px;background:transparent;display:flex;gap:10px;align-items:flex-start;border-radius:7px;color:var(--ink);cursor:pointer;margin-bottom:4px}.bd-proposal:hover{background:#efede6}.bd-proposal.on{background:#e8ece4;box-shadow:inset 2px 0 #6c8670}.bd-picon{width:27px;height:27px;flex:none;display:grid;place-items:center;border:1px solid #e1ded5;background:#fbfaf6;border-radius:7px;color:#6b7969}.bd-proposal-copy{min-width:0;flex:1}.bd-proposal-copy b{font-size:11px;font-weight:650;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bd-proposal-copy small{font-size:9px;color:#8d8d83;display:block;margin-top:4px}.bd-badge{font-size:8px;padding:3px 6px;border-radius:10px;white-space:nowrap;background:var(--amber-soft);color:#91683c}.bd-badge.green{background:#e3ece2;color:#59735d}.bd-badge.gray{background:#eeece6;color:#818177}
        .bd-rail-foot{margin-top:auto;border-top:1px solid var(--line);padding:15px 9px 0}.bd-rail-foot-title{font-size:9px;font-weight:700;letter-spacing:.1em;color:#8d8c82;margin-bottom:10px}.bd-scope{display:flex;align-items:center;gap:8px;padding:8px 0;color:#62645b;font-size:10px}.bd-scope svg{color:#74816f}.bd-scope small{margin-left:auto;color:#99988d;font-size:9px}
        .bd-main{padding:31px clamp(22px,4vw,57px) 42px;min-width:0}.bd-overline{font-size:9px;letter-spacing:.15em;font-weight:700;color:#85867b;text-transform:uppercase;display:flex;align-items:center;gap:8px;white-space:nowrap}.bd-overline span{width:5px;height:5px;border-radius:50%;background:#bc8e5d}.bd-title-row{display:flex;align-items:flex-start;gap:16px;margin:13px 0 7px}.bd-title{font-family:var(--app-font-display,Georgia,serif);font-size:clamp(30px,3vw,42px);font-weight:400;letter-spacing:-.045em;line-height:1.05;margin:0;flex:1}.bd-title-meta{padding-top:8px;color:#8c8d82;font-size:10px;white-space:nowrap}.bd-subtitle{margin:0;color:#75766e;font-size:12px;line-height:1.6;max-width:680px}
        .bd-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:25px 0 25px;background:#ebe8df;border-radius:7px;padding:4px}.bd-step{display:flex;align-items:center;gap:9px;padding:10px 12px;color:#8b8b80;font-size:10px;border-radius:5px}.bd-step.current{background:#fbfaf6;color:#42453d;box-shadow:0 1px 3px #292b2710}.bd-step.done{color:#5e765f}.bd-stepnum{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;border:1px solid #d5d2c9;font-size:9px}.bd-step.current .bd-stepnum{border-color:#a9b8a5;background:#e7ede4}.bd-step.done .bd-stepnum{border-color:#a9b8a5;background:#dce8da}
        .bd-section-head{display:flex;align-items:center;margin:0 0 11px;gap:9px}.bd-section-head h2{font-family:var(--app-font-display,Georgia,serif);font-size:19px;font-weight:400;margin:0;letter-spacing:-.02em}.bd-section-head small{color:#919188;font-size:10px}.bd-section-head .push{flex:1}
        .bd-diff{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}.bd-diff-toolbar{height:42px;background:#f9f7f1;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 14px;gap:8px}.bd-diff-toolbar strong{font-size:10px;font-weight:650}.bd-diff-count{color:#8e8c81;font-size:9px}.bd-diff-spacer{flex:1}.bd-total{color:#687f69;font:10px ui-monospace,monospace}.bd-icon-action{border:0;background:none;color:#8b8b80;cursor:pointer;padding:4px;display:grid;place-items:center}
        .bd-file{border-bottom:1px solid #eeeae1}.bd-file:last-child{border:0}.bd-file-head{width:100%;border:0;background:var(--surface);display:flex;align-items:center;gap:9px;padding:12px 14px;text-align:left;cursor:pointer;color:var(--ink)}.bd-file-head:hover{background:#f8f6f0}.bd-file-type{width:25px;height:25px;display:grid;place-items:center;border-radius:6px;background:#f0eee6;color:#77806f}.bd-file-name{font:10px ui-monospace,monospace;color:#53564d}.bd-file-desc{flex:1;color:#84857b;font-size:10px}.bd-line-count{font:9px ui-monospace,monospace;color:#779078}.bd-file-chevron{color:#aaa99f;transition:transform .2s}.bd-file.open .bd-file-chevron{transform:rotate(180deg)}
        .bd-change{padding:4px 15px 15px 49px;background:#fbfaf6}.bd-change-title{font-size:11px;font-weight:650;margin:0 0 6px}.bd-change-detail{color:#7e7f75;font-size:10px;line-height:1.55;margin:0 0 10px}.bd-code{background:#f1f0e9;border:1px solid #e7e4db;border-radius:5px;padding:10px 11px;font:9px/1.8 ui-monospace,SFMono-Regular,monospace;color:#77796f;overflow-x:auto}.bd-code .plus{color:#537859;background:#e5eee4}.bd-code .minus{color:#a66c59;background:#f4e9e3}.bd-code div{white-space:pre}
        .bd-lower{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:17px}.bd-note{border:1px solid var(--line);background:#f9f7f1;border-radius:7px;padding:13px}.bd-note-head{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:650;margin-bottom:8px}.bd-note-head svg{color:#85927e}.bd-note p{font-size:10px;line-height:1.6;color:#7d7e74;margin:0}.bd-note button{border:0;background:none;color:#647b65;cursor:pointer;font-size:9px;padding:7px 0 0}
        .bd-side{padding:24px 17px;background:#f7f5ef;border-left:1px solid var(--line)}.bd-side-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:15px;margin-bottom:12px}.bd-side-title{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700}.bd-side-title svg{color:#637b65}.bd-side-copy{color:#7e7f75;font-size:10px;line-height:1.6;margin:8px 0 12px}.bd-check{display:flex;gap:9px;padding:9px 0;border-top:1px solid #eeece4}.bd-check:first-of-type{border-top:0}.bd-check-icon{width:17px;height:17px;flex:none;border-radius:50%;display:grid;place-items:center;color:#a37a47;background:#f5eddf}.bd-check-icon.complete{color:#537657;background:#e5eee3}.bd-check b{display:block;font-size:10px;font-weight:600}.bd-check small{display:block;color:#929187;font-size:9px;margin-top:3px;line-height:1.4}.bd-run{width:100%;height:32px;border:1px solid #d9d6cc;border-radius:5px;background:#f8f6f0;color:#4b5148;cursor:pointer;font-size:10px;font-weight:600;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px}.bd-run:hover{background:#efeee6}
        .bd-approval{background:#edf1e9;border:1px solid #dce5d8;border-radius:8px;padding:14px;margin-bottom:12px}.bd-approval-head{display:flex;gap:8px;align-items:center;font-family:var(--app-font-display,Georgia,serif);font-size:16px}.bd-approval-head svg{color:#5f7b62}.bd-approval p{font-size:10px;line-height:1.55;color:#6c756a;margin:8px 0 12px}.bd-approve{width:100%;height:36px;border:0;background:#526b58;color:#fffdf7;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:10px;font-weight:650;cursor:pointer;transition:transform .16s,opacity .16s}.bd-approve:hover:not(:disabled){transform:translateY(-1px);background:#455c4a}.bd-approve:disabled{opacity:.48;cursor:not-allowed}.bd-secondary{width:100%;height:31px;border:1px solid #d7d5cc;background:#fbfaf6;border-radius:5px;color:#66685f;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-top:7px}
        .bd-integration{display:flex;align-items:center;gap:9px}.bd-github{width:29px;height:29px;border:1px solid var(--line);border-radius:7px;display:grid;place-items:center;color:#57594f}.bd-integration b{font-size:10px;display:block}.bd-integration small{font-size:9px;color:#929187}.bd-not-connected{margin-left:auto;border-radius:10px;padding:4px 7px;background:#f0eee6;color:#88877d;font-size:8px}
        .bd-footer{height:38px;display:flex;align-items:center;padding:0 22px;border-top:1px solid var(--line);background:#fbfaf6;color:#85867b;font-size:9px;gap:19px}.bd-footer .safe{color:#647b65}.bd-footer .spacer{flex:1}
        .bd-modal-cover{position:fixed;inset:0;z-index:5;background:#292b2738;display:grid;place-items:center;padding:18px}.bd-modal{width:min(430px,100%);border:1px solid var(--line);background:var(--surface);border-radius:10px;box-shadow:0 18px 60px #24271f26;padding:20px}.bd-modal h3{font-family:var(--app-font-display,Georgia,serif);font-weight:400;font-size:23px;margin:0 0 5px}.bd-modal p{color:#7d7e74;font-size:11px;line-height:1.6;margin:0 0 15px}.bd-modal textarea{width:100%;min-height:90px;border:1px solid var(--line);background:#f8f6f0;padding:10px;border-radius:5px;resize:vertical;outline-color:#94a58f}.bd-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:13px}.bd-modal-actions button{height:32px;border-radius:5px;padding:0 12px;border:1px solid var(--line);background:#f9f7f1;cursor:pointer;color:#5c5e54;font-size:10px}.bd-modal-actions .primary{background:#526b58;color:white;border-color:#526b58}.bd-toast{position:fixed;z-index:9;bottom:55px;left:50%;transform:translateX(-50%);background:#2e3830;color:#f6f4ed;padding:10px 14px;border-radius:6px;font-size:10px;box-shadow:0 5px 18px #1f231d30}
        @media(max-width:1050px){.bd-layout{grid-template-columns:215px minmax(0,1fr)}.bd-side{grid-column:2;border-left:0;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:15px 22px}.bd-side-card,.bd-approval{margin:0}.bd-side-card:last-child{grid-column:span 2}.bd-main{padding:26px 26px}.bd-rail{grid-row:span 2}}
        @media(max-width:700px){.bd-top{height:54px;padding:0 14px;gap:11px}.bd-crumb{display:none}.bd-live{margin-left:auto}.bd-layout{display:flex;flex-direction:column}.bd-rail{order:2;border-right:0;border-top:1px solid var(--line);padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:3px}.bd-rail-title{grid-column:span 2;padding-bottom:8px}.bd-rail-foot{display:none}.bd-proposal{padding:9px 7px}.bd-proposal-copy b{font-size:10px}.bd-proposal-copy small{font-size:8px}.bd-badge{display:none}.bd-main{order:1;padding:24px 17px}.bd-title-row{display:block}.bd-title-meta{padding-top:6px}.bd-progress{margin:20px 0}.bd-step{padding:8px 5px;gap:5px;font-size:8px}.bd-stepnum{width:17px;height:17px}.bd-diff-toolbar{padding:0 10px}.bd-file-head{padding:10px}.bd-file-desc{display:none}.bd-change{padding:3px 10px 12px 42px}.bd-lower{grid-template-columns:1fr}.bd-side{order:3;display:flex;flex-direction:column;padding:14px 17px;border-top:1px solid var(--line)}.bd-side-card:last-child{width:100%}.bd-footer{gap:10px;padding:0 12px;font-size:8px}.bd-footer .hide-mobile{display:none}}
      `}</style>
      <div className="bd-app">
        <header className="bd-top">
          <div className="bd-brand"><span className="bd-mark"><Sparkles size={15} /></span> tinanai <span style={{ color: '#9b9b90', fontWeight: 500, fontSize: 10 }}>BUILDER</span></div>
          <div className="bd-crumb"><span>Projects</span><ArrowRight size={11} /><b>Fieldnotes journal</b></div>
          <div className="bd-top-spacer" />
          <div className="bd-live"><i /> Local workspace</div>
          <button className="bd-round" aria-label="Open project activity" onClick={() => setShowActivity(true)}><History size={13} /></button>
          <div className="bd-avatar">AM</div>
        </header>
        <div className="bd-layout">
          <aside className="bd-rail">
            <div className="bd-rail-title">Change requests <button className="bd-round" aria-label="Create a new request" onClick={() => setShowNew(true)}><Plus size={13} /></button></div>
            {proposals.map((item, index) => <button className={`bd-proposal ${active === index ? 'on' : ''}`} key={item.title} onClick={() => { setActive(index); setApproved(item.status === 'Approved'); setChecks(false); }}>
              <span className="bd-picon"><FileText size={13} /></span><span className="bd-proposal-copy"><b>{item.title}</b><small>{item.subtitle} · {item.time}</small></span>
              <span className={`bd-badge ${item.status === 'Approved' ? 'green' : item.status === 'Draft' ? 'gray' : ''}`}>{item.status}</span>
            </button>)}
            <div className="bd-rail-foot">
              <div className="bd-rail-foot-title">Workspace boundary</div>
              <div className="bd-scope"><LockKeyhole size={13} /> Browser-local source <small>private</small></div>
              <div className="bd-scope"><Code2 size={13} /> Static files only <small>3 files</small></div>
            </div>
          </aside>
          <main className="bd-main">
            <div className="bd-overline"><span /> CHANGE REQUEST <span style={{ color: '#aaa99f', fontWeight: 500, letterSpacing: 0 }}>· {selected.status.toUpperCase()}</span></div>
            <div className="bd-title-row"><h1 className="bd-title">{active === 0 ? 'A clearer path back to your notes' : selected.title}</h1><div className="bd-title-meta">Prepared 2 minutes ago</div></div>
            <p className="bd-subtitle">A proposed update to the journal’s home screen. Review the intent, inspect each file-level change, then choose what happens next.</p>
            <div className="bd-progress">
              <div className="bd-step done"><span className="bd-stepnum"><Check size={10} /></span>Request shaped</div>
              <div className="bd-step current"><span className="bd-stepnum">2</span>Review changes</div>
              <div className={`bd-step ${approved ? 'done' : ''}`}><span className="bd-stepnum">{approved ? <Check size={10} /> : '3'}</span>Approve to apply</div>
            </div>
            <div className="bd-section-head"><h2>Proposed changes</h2><small>Nothing has been written yet</small><span className="push" /><button className="bd-icon-action" aria-label="More change options" onClick={() => announce('Change options are available after review.')}><MoreHorizontal size={16} /></button></div>
            <section className="bd-diff">
              <div className="bd-diff-toolbar"><FileCode2 size={13} color="#71806c" /><strong>Source overview</strong><span className="bd-diff-count">3 files changed</span><span className="bd-diff-spacer" /><span className="bd-total">+24 −6</span><button className="bd-icon-action" aria-label="Collapse all file details" onClick={() => setExpanded(expanded ? null : 'index.html')}><ChevronDown size={13} /></button></div>
              {diffRows.map((row) => <article className={`bd-file ${expanded === row.file ? 'open' : ''}`} key={row.file}>
                <button className="bd-file-head" onClick={() => setExpanded(expanded === row.file ? null : row.file)}>
                  <span className="bd-file-type"><FileCode2 size={13} /></span><span className="bd-file-name">{row.file}</span><span className="bd-file-desc">{row.title}</span><span className="bd-line-count">{row.additions} {row.removals}</span><ChevronDown className="bd-file-chevron" size={13} />
                </button>
                {expanded === row.file && <div className="bd-change">
                  <p className="bd-change-title">{row.title}</p><p className="bd-change-detail">{row.detail}</p>
                  <div className="bd-code"><div><span className="minus">− &nbsp;old approach: keep each entry title-only</span></div><div><span className="plus">+ &nbsp;add context for a faster scan</span></div><div><span className="plus">+ &nbsp;retain existing local behavior</span></div></div>
                </div>}
              </article>)}
            </section>
            <div className="bd-lower">
              <div className="bd-note"><div className="bd-note-head"><MessageSquare size={13} /> Why this proposal</div><p>Make the latest work easier to pick up again, without changing the quiet rhythm of the journal.</p><button onClick={() => setShowComment(true)}>Add a review note</button></div>
              <div className="bd-note"><div className="bd-note-head"><ShieldCheck size={13} /> Scope kept small</div><p>Static HTML, CSS and JS only. No deployment, external services, or repository access in this mockup.</p><button onClick={() => setShowActivity(true)}>See activity history</button></div>
            </div>
          </main>
          <aside className="bd-side">
            <section className="bd-side-card">
              <div className="bd-side-title"><Activity size={14} /> Before approval</div>
              <p className="bd-side-copy">Run the lightweight checks to see what has been inspected. A green check is not a full build or security guarantee.</p>
              <div className="bd-check"><span className={`bd-check-icon ${checks ? 'complete' : ''}`}>{checks ? <Check size={11} /> : <Circle size={10} />}</span><div><b>Static source review</b><small>{checks ? 'Local paths and references inspected' : 'File names and local references'}</small></div></div>
              <div className="bd-check"><span className={`bd-check-icon ${checks ? 'complete' : ''}`}>{checks ? <Check size={11} /> : <Circle size={10} />}</span><div><b>Preview boundary</b><small>{checks ? 'Sandboxed static preview only' : 'No server process or resource quotas'}</small></div></div>
              <button className="bd-run" onClick={() => { setChecks(true); announce('Two lightweight review checks completed.'); }}><Activity size={12} /> {checks ? 'Run checks again' : 'Run review checks'}</button>
            </section>
            <section className="bd-approval">
              <div className="bd-approval-head"><ShieldCheck size={17} /> Your call, before changes</div>
              <p>{approved ? 'This proposal is marked approved in this visual prototype. No files were changed.' : 'Approval is a deliberate separate step. Reviewing the proposal never applies it by itself.'}</p>
              <button className="bd-approve" disabled={!canApprove || approved} onClick={() => { setApproved(true); announce('Approval recorded in this prototype. No source was changed.'); }}>
                {approved ? <><CheckCircle2 size={13} /> Approved in prototype</> : <><Check size={13} /> Approve proposal</>}
              </button>
              <button className="bd-secondary" onClick={() => { setShowComment(true); setComment('Please revise this proposal: '); }}><MessageSquare size={12} /> Request a revision</button>
            </section>
            <section className="bd-side-card">
              <div className="bd-integration"><span className="bd-github"><GitBranch size={14} /></span><span><b>Repository connection</b><small>Not linked to a remote</small></span><span className="bd-not-connected">OFF</span></div>
              <p className="bd-side-copy" style={{ marginBottom: 0 }}>GitHub sync and push are not connected.</p>
            </section>
          </aside>
        </div>
        <footer className="bd-footer"><span className="safe"><LockKeyhole size={10} style={{ verticalAlign: '-2px', marginRight: 4 }} />Private local workspace</span><span className="hide-mobile">Review checkpoint</span><span className="hide-mobile">No backend execution</span><span className="spacer" /><span>Builder concept</span></footer>
      </div>
      {(showComment || showActivity || showNew) && <div className="bd-modal-cover" onClick={() => { setShowComment(false); setShowActivity(false); setShowNew(false); }}>
        <section className="bd-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <button className="bd-icon-action" style={{ float: 'right' }} aria-label="Close dialog" onClick={() => { setShowComment(false); setShowActivity(false); setShowNew(false); }}><X size={15} /></button>
          {showComment ? <><h3>Leave a review note</h3><p>Your note stays in this prototype. It does not message an agent or modify source.</p><textarea aria-label="Review note" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What should change before this is ready?" /><div className="bd-modal-actions"><button onClick={() => setShowComment(false)}>Cancel</button><button className="primary" onClick={() => { setShowComment(false); announce(comment.trim() ? 'Review note saved locally.' : 'No note added.'); }}>Save note</button></div></> :
            showActivity ? <><h3>Project activity</h3><p>A local record of this review session. No remote history or account sync is connected.</p><div className="bd-check"><span className="bd-check-icon complete"><Check size={11} /></span><div><b>Proposal prepared</b><small>Source outline created · 2 min ago</small></div></div><div className="bd-check"><span className="bd-check-icon"><Clock3 size={11} /></span><div><b>Waiting for your review</b><small>Nothing has been applied</small></div></div><div className="bd-modal-actions"><button className="primary" onClick={() => setShowActivity(false)}>Done</button></div></> :
            <><h3>Start a review request</h3><p>This prototype does not send a prompt. A connected project would start with a scoped, reviewable proposal.</p><textarea aria-label="New request" placeholder="Describe one small change you want to review…" /><div className="bd-modal-actions"><button onClick={() => setShowNew(false)}>Cancel</button><button className="primary" onClick={() => { setShowNew(false); announce('Request draft kept local; no agent was started.'); }}>Save as draft</button></div></>}
        </section>
      </div>}
      {toast && <div className="bd-toast" role="status">{toast}</div>}
    </div>
  );
}
