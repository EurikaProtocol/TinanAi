import './_group.css';

const source = `<!doctype html>
<html>
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
        <h1>Good morning, Jamie <span>✦</span></h1>
        <p>Here's what's happening with your work today.</p>
      </section>
      <section class="stats">
        <article><span>IN PROGRESS</span><strong>04</strong><small>Across 3 projects</small></article>
        <article><span>COMPLETED</span><strong>12</strong><small>+3 this week</small></article>
        <article><span>UP NEXT</span><strong>03</strong><small>Due this week</small></article>
      </section>
      <section class="tasks">
        <div class="section-head"><h2>Your tasks</h2><a>View all <b>→</b></a></div>
        <article class="task"><i class="check"></i><div><strong>Finalize homepage wireframes</strong><small>Website redesign <span>·</span> Due today</small></div><em class="priority">High</em></article>
        <article class="task"><i class="check"></i><div><strong>Review Q2 campaign brief</strong><small>Spring campaign <span>·</span> Due tomorrow</small></div><em>Medium</em></article>
        <article class="task"><i class="check done">✓</i><div><strong>Share research findings</strong><small>Product discovery <span>·</span> Completed yesterday</small></div><em>Done</em></article>
      </section>
    </main>
  </body>
</html>`;

function Icon({ children }: { children: string }) {
  return <span className="tb-icon" aria-hidden="true">{children}</span>;
}

function ActionButton({ children, variant = '' }: { children: React.ReactNode; variant?: string }) {
  return <button className={`tb-button ${variant}`} type="button">{children}</button>;
}

export function Current() {
  return (
    <div className="tinanai-current min-h-screen">
      <div className="tb-page">
        <header className="tb-page-header">
          <p className="tb-eyebrow">PROJECT BUILDER</p>
          <h1>From prompt to working source.</h1>
          <p className="tb-page-desc">Generate, inspect, edit and test small static apps without losing track of the files or the limits of the preview.</p>
        </header>

        <div className="tb-layout">
          <aside className="tb-aside">
            <section className="tb-card tb-start">
              <div className="tb-card-heading">
                <h2>Start a session</h2>
                <span className="tb-local-pill">This browser</span>
              </div>
              <label className="tb-field">
                <span>Output type</span>
                <select defaultValue="app" aria-label="Output type">
                  <option value="app">Static app</option><option>Token (ERC-20)</option><option>Analytics</option><option>JSON</option>
                </select>
              </label>
              <label className="tb-field">
                <span className="tb-field-label">Describe the work <small>126 / 12,000</small></span>
                <textarea rows={5} defaultValue="Build a simple task management app for a small creative team. Help people see what's in progress, what's next, and what they've completed." />
              </label>
              <div className="tb-upload">
                <div className="tb-upload-row">
                  <Icon>⇧</Icon>
                  <p>Drop files or choose. Request-only; scripts are never run.</p>
                  <ActionButton><b>＋</b> Add files</ActionButton>
                </div>
              </div>
              <p className="tb-privacy">Uploaded content is processed for this request only. Do not upload credentials, wallet keys or secrets. Generated output is source, not executed in the API process.</p>
              <ActionButton variant="tb-generate"><Icon>✦</Icon> Generate static app</ActionButton>
            </section>

            <section className="tb-card tb-projects">
              <div className="tb-card-heading">
                <div><p className="tb-eyebrow">WORKSPACE</p><h2>Projects <small>2</small></h2></div>
                <ActionButton><b>＋</b> New</ActionButton>
              </div>
              <article className="tb-project selected">
                <div className="tb-project-title"><strong>Taskflow dashboard</strong><span className="tb-status"><i /> Ready</span></div>
                <p>Team task management · Static HTML · CSS · JavaScript</p>
                <div className="tb-project-footer"><span>Browser-local · 12 min ago</span><span className="tb-project-actions"><button aria-label="Preview project">▣</button><button aria-label="Duplicate project">▢</button><button aria-label="Delete project">⌫</button></span></div>
              </article>
              <article className="tb-project">
                <div className="tb-project-title"><strong>Recipe card concept</strong><span className="tb-status muted"><i /> Draft</span></div>
                <p>A clean way to collect favorite recipes</p>
                <div className="tb-project-footer"><span>Browser-local · Yesterday</span><span className="tb-project-actions"><button aria-label="Preview project">▣</button><button aria-label="Duplicate project">▢</button><button aria-label="Delete project">⌫</button></span></div>
              </article>
              <p className="tb-project-note">Projects in this mode remain in this browser Workspace store and are not synced.</p>
            </section>
          </aside>

          <main className="tb-main">
            <section className="tb-card tb-editor">
              <div className="tb-editor-heading">
                <div className="tb-project-identity">
                  <span className="tb-code-mark"><Icon>⌘</Icon></span>
                  <div><h2>Taskflow dashboard</h2><p>Browser-local project</p></div>
                </div>
                <div className="tb-editor-actions">
                  <ActionButton><Icon>◷</Icon> Versions</ActionButton>
                  <ActionButton><Icon>⇩</Icon> Export ZIP</ActionButton>
                  <ActionButton variant="tb-save"><Icon>▣</Icon> Save</ActionButton>
                </div>
              </div>
              <div className="tb-workbench">
                <aside className="tb-file-panel">
                  <div className="tb-panel-label">SOURCE FILES <button title="Add file">＋</button></div>
                  <button className="tb-file active"><Icon>▤</Icon> index.html</button>
                  <button className="tb-file"><Icon>▤</Icon> styles.css</button>
                  <button className="tb-file"><Icon>▤</Icon> app.js</button>
                  <button className="tb-import"><Icon>⇧</Icon> Import source files</button>
                  <div className="tb-metadata">
                    <label className="tb-field"><span>App category</span><select defaultValue="productivity"><option value="productivity">Productivity</option></select></label>
                    <label className="tb-field"><span>Project description</span><textarea rows={2} defaultValue="A focused task dashboard for small creative teams." /></label>
                    <label className="tb-field"><span>Source template</span><select disabled><option>AI-generated source</option></select></label>
                    <label className="tb-field"><span>Framework</span><select disabled><option>Static HTML / CSS / JS</option></select></label>
                  </div>
                </aside>
                <div className="tb-code-panel">
                  <div className="tb-code-toolbar"><span>index.html</span><div><button title="Download file">⇩</button><button title="Remove file">⌫</button></div></div>
                  <div className="tb-code" aria-label="Source code editor">
                    <pre><code>{source.split('\n').map((line, index) => <span className="tb-code-line" key={index}><i>{index + 1}</i><b className={line.trim().startsWith('<') ? 'tag-line' : ''}>{line || ' '}</b></span>)}</code></pre>
                  </div>
                </div>
              </div>
            </section>

            <div className="tb-lower-grid">
              <section className="tb-card tb-preview">
                <div className="tb-section-title">
                  <div><Icon>▣</Icon><h2>Isolated preview</h2><span className="tb-status"><i /> Ready</span><span className="tb-sandbox-pill">Sandboxed</span></div>
                  <ActionButton><Icon>↻</Icon> Refresh</ActionButton>
                </div>
                <div className="tb-preview-window">
                  <div className="tf-topbar"><div className="tf-brand"><b>t</b> taskflow</div><span className="tf-avatar">JD</span></div>
                  <div className="tf-content">
                    <p className="tf-date">MONDAY, MAY 19, 2025</p>
                    <h3>Good morning, Jamie <span>✦</span></h3>
                    <p className="tf-subtitle">Here's what's happening with your work today.</p>
                    <div className="tf-stats"><article><small>IN PROGRESS</small><strong>04</strong><em>Across 3 projects</em></article><article><small>COMPLETED</small><strong>12</strong><em>+3 this week</em></article><article><small>UP NEXT</small><strong>03</strong><em>Due this week</em></article></div>
                    <div className="tf-task-heading"><strong>Your tasks</strong><a>View all　→</a></div>
                    <div className="tf-task"><i /><div><b>Finalize homepage wireframes</b><small>Website redesign　·　Due today</small></div><span>High</span></div>
                    <div className="tf-task"><i /><div><b>Review Q2 campaign brief</b><small>Spring campaign　·　Due tomorrow</small></div><span>Medium</span></div>
                    <div className="tf-task"><i className="checked">✓</i><div><b>Share research findings</b><small>Product discovery　·　Completed yesterday</small></div><span>Done</span></div>
                  </div>
                </div>
                <div className="tb-preview-warning">Preview runs in an iframe sandbox without <code>allow-same-origin</code> and uses a restrictive CSP. Network API calls and external assets are blocked; no TINANAI secrets, filesystem, or environment access are provided. Only index.html and safe local CSS/JS are previewed. Browser sandboxing is not a process boundary: navigation behavior varies by browser, and CPU or memory quotas are not enforced, so a runaway script can stall this tab.</div>
              </section>

              <section className="tb-card tb-checks">
                <div><p className="tb-eyebrow">CONFIDENCE, WITH LIMITS</p><h2>Check the source</h2></div>
                <div className="tb-check-item">
                  <div className="tb-check-title"><strong>Static checks</strong><span className="tb-status muted"><i /> Not run</span></div>
                  <p>Checks entry file, safe paths, file size and local references.</p>
                  <ActionButton><Icon>⬡</Icon> Run static checks</ActionButton>
                </div>
                <div className="tb-check-item">
                  <div className="tb-check-title"><strong>Basic smoke test</strong><span className="tb-status muted"><i /> Not run</span></div>
                  <p>Checks initial iframe load and captures runtime errors; not exhaustive.</p>
                  <ActionButton><Icon>▶</Icon> Run smoke test</ActionButton>
                </div>
                <ActionButton variant="tb-outline"><Icon>⇩</Icon> Download test report</ActionButton>
                <div className="tb-console"><div><strong>RUNTIME CONSOLE</strong><span>0</span></div><p>No runtime messages captured.</p></div>
                <p className="tb-limit-note">Static checks are not a production build. The smoke test covers one initial browser load only. React, TypeScript, npm, network services and backend execution are not supported.</p>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
