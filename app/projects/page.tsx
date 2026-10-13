'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Project = {
  id: string;
  name: string;
  specification: string;
  technology: string[];
  tasks: string[];
  files: string[];
  latestDiff: { path: string; added: number; removed: number }[];
  logs: { message: string; timestamp: string }[];
  checks: { check: string; status: string; output: string; timestamp: string }[];
  previewStatus: string;
  updatedAt: string;
};

type BuilderTask = {
  id: string;
  projectId: string | null;
  status: 'generating' | 'completed' | 'failed' | 'cancelled';
  progress: string[];
  errors: string[];
  kind: 'generation' | 'check';
  check: string | null;
};

const checks = ['lint', 'typecheck', 'test', 'build'] as const;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [requirements, setRequirements] = useState('');
  const [task, setTask] = useState<BuilderTask | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;

  const refreshProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load projects.');
      setProjects(payload.projects as Project[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load projects.');
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const refreshTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/projects/tasks/${encodeURIComponent(taskId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not update task status.');
      const updated = payload.task as BuilderTask;
      setTask(updated);
      if (updated.status !== 'generating') await refreshProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update task status.');
    }
  }, [refreshProjects]);

  useEffect(() => {
    if (!task || task.status !== 'generating') return;
    const timer = window.setInterval(() => void refreshTask(task.id), 1000);
    return () => window.clearInterval(timer);
  }, [task, refreshTask]);

  async function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requirements.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements,
          ...(selectedId ? { projectId: selectedId } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Project generation could not start.');
      setTask(payload.task as BuilderTask);
      setRequirements('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project generation could not start.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runCheck(check: string) {
    if (!selectedId) return;
    setError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedId)}/checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sandbox check could not start.');
      setTask(payload.task as BuilderTask);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sandbox check could not start.');
    }
  }

  async function cancelTask() {
    if (!task) return;
    const response = await fetch(`/api/projects/tasks/${encodeURIComponent(task.id)}/cancel`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Task could not be cancelled.');
      return;
    }
    setTask(payload.task as BuilderTask);
  }

  async function openFile(file: string) {
    if (!selectedId) return;
    setSelectedFile(file);
    setFileContent('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedId)}/files?path=${encodeURIComponent(file)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'File could not be read.');
      setFileContent(payload.content as string);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'File could not be read.');
    }
  }

  async function rollback() {
    if (!selectedId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(selectedId)}/rollback`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Rollback unavailable.');
      return;
    }
    setProjects((current) => current.map((project) => project.id === selectedId ? payload.project : project));
  }

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <Link className="builder-brand" href="/"><span className="brand-mark">T</span><strong>TINAN <span>ULTRA</span></strong></Link>
        <div className="builder-breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>Project Builder</strong></div>
        <span className="builder-status"><i /> Server-side generation</span>
      </header>

      <section className="builder-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />TINAN AI ULTRA</div>
          <h1>From idea to workspace.</h1>
          <p>Describe what you want to build. Review the specification, generated files, and isolated check results.</p>
        </div>
        <div className="builder-safety"><span>⌑</span> Generation requires a configured AI provider. Checks run only in a digest-pinned, network-isolated Docker sandbox.</div>
      </section>

      {error && <div className="builder-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}

      <div className="builder-layout">
        <aside className="project-sidebar">
          <div className="section-kicker">YOUR PROJECTS <span>{projects.length.toString().padStart(2, '0')}</span></div>
          <button className={`project-list-item ${selectedId === '' ? 'active' : ''}`} onClick={() => { setSelectedId(''); setSelectedFile(''); }} type="button">
            <span className="project-list-icon">＋</span><span><strong>New project</strong><small>Start from requirements</small></span>
          </button>
          {projects.length === 0 && <p className="project-empty">Generated workspaces will appear here.</p>}
          {projects.map((project) => (
            <button className={`project-list-item ${selectedId === project.id ? 'active' : ''}`} key={project.id} onClick={() => { setSelectedId(project.id); setSelectedFile(''); setFileContent(''); }} type="button">
              <span className="project-list-icon">◇</span><span><strong>{project.name}</strong><small>{project.technology.slice(0, 2).join(' · ') || 'Project workspace'}</small></span>
            </button>
          ))}
          <div className="project-storage-note">Workspaces stored in local server filesystem. No database or user sign-in is configured.</div>
        </aside>

        <section className="builder-main">
          <form className="requirements-card" onSubmit={submitGeneration}>
            <label htmlFor="project-requirements">{selectedId ? 'CONTINUE BUILDING THIS PROJECT' : 'DESCRIBE YOUR PROJECT'}</label>
            {selectedProject && <p className="selected-project-note">Adding generated files to <strong>{selectedProject.name}</strong>. Existing source is snapshotted for rollback.</p>}
            <textarea
              id="project-requirements"
              maxLength={8000}
              onChange={(event) => setRequirements(event.target.value)}
              placeholder="A lightweight habit tracker with a weekly view, accessible forms, and local storage…"
              rows={4}
              value={requirements}
            />
            <div className="requirements-footer">
              <span>Up to 8,000 characters · Model output is validated before writing.</span>
              <button className="builder-submit" disabled={!requirements.trim() || isSubmitting || task?.status === 'generating'} type="submit">
                {isSubmitting ? 'Starting…' : selectedId ? 'Generate changes' : 'Generate project'} <span>↗</span>
              </button>
            </div>
          </form>

          {task && (
            <section className="builder-task-card" aria-live="polite">
              <div className="builder-task-head"><div><span className={`task-state-dot ${task.status}`} /><strong>{task.kind === 'check' ? `${task.check} sandbox check` : 'Project generation'}</strong><small>{task.status.toUpperCase()}</small></div>
                {task.status === 'generating' && <button type="button" onClick={cancelTask}>Cancel</button>}
              </div>
              <ol>{task.progress.map((message, index) => <li key={`${task.id}-${index}`}>{message}</li>)}</ol>
              {task.errors.map((message, index) => <p className="builder-error inline" key={`${task.id}-error-${index}`}>{message}</p>)}
            </section>
          )}

          {selectedProject ? (
            <ProjectWorkspace
              onOpenFile={openFile}
              onRollback={rollback}
              onRunCheck={runCheck}
              project={selectedProject}
              selectedFile={selectedFile}
              fileContent={fileContent}
            />
          ) : (
            <section className="builder-empty-state">
              <span className="builder-empty-glyph">✳</span>
              <h2>A real project starts with a clear brief.</h2>
              <p>Generated files will be stored in an isolated workspace with reviewable changes and explicit check results.</p>
              <div><span>01</span> Project specification <span>02</span> Task plan <span>03</span> Source tree</div>
            </section>
          )}
        </section>
      </div>
      <footer className="builder-footer"><span>✳ &nbsp;Intelligence, with intention.</span><span>Preview is not launched · Deployment is never automatic</span></footer>
    </main>
  );
}

function ProjectWorkspace({
  project,
  selectedFile,
  fileContent,
  onOpenFile,
  onRunCheck,
  onRollback,
}: {
  project: Project;
  selectedFile: string;
  fileContent: string;
  onOpenFile: (file: string) => void;
  onRunCheck: (check: string) => void;
  onRollback: () => void;
}) {
  return (
    <section className="project-workspace">
      <div className="project-summary">
        <div><div className="section-kicker">PROJECT SPECIFICATION</div><h2>{project.name}</h2><p>{project.specification}</p></div>
        <div className="project-actions"><a href={`/api/projects/${encodeURIComponent(project.id)}/export`}>Export .tar.gz</a><button type="button" onClick={onRollback}>Rollback last generation</button></div>
        <div className="technology-tags">{project.technology.map((item) => <span key={item}>{item}</span>)}</div>
        <div className="task-plan-list"><strong>BUILD PLAN</strong>{project.tasks.map((item, index) => <p key={`${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span>{item}</p>)}</div>
      </div>

      <div className="project-inspector">
        <section className="file-panel">
          <div className="inspector-heading"><strong>FILE TREE</strong><span>{project.files.length} files</span></div>
          <ul>{project.files.map((file) => <li key={file}><button className={selectedFile === file ? 'selected' : ''} type="button" onClick={() => onOpenFile(file)}><span>▧</span>{file}</button></li>)}</ul>
        </section>
        <section className="code-panel">
          <div className="inspector-heading"><strong>{selectedFile || 'SOURCE PREVIEW'}</strong><span>{selectedFile ? 'READ ONLY' : 'Select a file'}</span></div>
          <pre>{fileContent || (selectedFile ? 'Loading file…' : 'Select a file from the tree to inspect generated source.')}</pre>
        </section>
      </div>

      <section className="diff-panel">
        <div className="inspector-heading"><strong>GENERATED CHANGES</strong><span>{project.latestDiff.length} files</span></div>
        {project.latestDiff.length ? project.latestDiff.map((diff) => (
          <div className="diff-row" key={diff.path}><code>{diff.path}</code><span className="diff-added">+{diff.added}</span><span className="diff-removed">−{diff.removed}</span><span>lines</span></div>
        )) : <p className="no-diff">No generated changes recorded yet.</p>}
      </section>

      <section className="checks-panel">
        <div className="inspector-heading"><strong>ISOLATED CHECKS</strong><span>Preview: {project.previewStatus.replace('_', ' ')}</span></div>
        <div className="check-actions">{checks.map((check) => <button key={check} onClick={() => onRunCheck(check)} type="button">{check}</button>)}</div>
        {project.checks.length ? project.checks.map((check, index) => (
          <details className="check-result" key={`${check.timestamp}-${index}`}>
            <summary><span className={`check-status ${check.status}`}>{check.status}</span><strong>{check.check}</strong><time>{new Date(check.timestamp).toLocaleString()}</time></summary>
            <pre>{check.output || 'No output.'}</pre>
          </details>
        )) : <p className="no-diff">Checks require Docker plus a pre-pulled digest-pinned sandbox image. No preview or build is claimed.</p>}
      </section>

      <section className="logs-panel">
        <div className="inspector-heading"><strong>TASK LOG</strong><span>Recent events</span></div>
        {project.logs.map((log, index) => <p key={`${log.timestamp}-${index}`}><time>{new Date(log.timestamp).toLocaleTimeString()}</time>{log.message}</p>)}
      </section>
    </section>
  );
}
