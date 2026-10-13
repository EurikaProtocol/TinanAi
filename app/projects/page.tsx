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
  latestDiff: { path: string; added: number; removed: number; patch: string }[];
  logs: { message: string; timestamp: string }[];
  checks: { check: string; status: string; output: string; timestamp: string }[];
  previewStatus: string;
  repairAttempts: number;
  deploymentDraft: {
    status: string;
    target: string | null;
    buildCommand: string;
    automaticDeployment: boolean;
    requiresManualApproval: boolean;
  };
  updatedAt: string;
};

type BuilderTask = {
  id: string;
  projectId: string | null;
  status: 'planning' | 'awaiting_approval' | 'generating' | 'committing' | 'completed' | 'failed' | 'cancelled';
  plan: { summary: string; technology: string[]; features: string[]; steps: string[] } | null;
  progress: string[];
  errors: string[];
  kind: 'generation' | 'repair' | 'check';
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
      if (!['planning', 'awaiting_approval', 'generating', 'committing'].includes(updated.status)) {
        await refreshProjects();
        if (updated.kind === 'generation' && updated.status === 'completed' && updated.projectId) {
          setSelectedId(updated.projectId);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update task status.');
    }
  }, [refreshProjects]);

  useEffect(() => {
    if (!task || !['planning', 'awaiting_approval', 'generating', 'committing'].includes(task.status)) return;
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

  async function respondToPlan(approved: boolean) {
    if (!task) return;
    setError('');
    try {
      const response = await fetch(`/api/projects/tasks/${encodeURIComponent(task.id)}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Project plan approval could not be recorded.');
      setTask(payload.task as BuilderTask);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Project plan approval could not be recorded.');
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

  async function requestRepair() {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedId)}/repair`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Repair could not start.');
      setTask(payload.task as BuilderTask);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Repair could not start.');
    }
  }

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <Link className="builder-brand" href="/"><span className="brand-mark">T</span><strong>TINAN <span>ULTRA</span></strong></Link>
        <div className="builder-breadcrumb"><Link href="/">Workspace</Link><span>/</span><strong>Project Builder</strong></div>
        <span className="builder-status"><i /> Plan review before generation</span>
      </header>

      <section className="builder-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />TINAN AI ULTRA</div>
          <h1>From idea to workspace.</h1>
          <p>Describe what you want to build. Review a provider-generated plan before approving source generation.</p>
        </div>
        <div className="builder-safety"><span>⌑</span> Plan and generation require a configured server-side AI provider. Generated code is never executed here; validation is unavailable.</div>
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
          <div className="project-storage-note">Single-owner access · configured D1 metadata and R2 project files</div>
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
              <button className="builder-submit" disabled={!requirements.trim() || isSubmitting || (task !== null && ['planning', 'awaiting_approval', 'generating', 'committing'].includes(task.status))} type="submit">
                {isSubmitting ? 'Preparing plan…' : selectedId ? 'Plan project changes' : 'Create project plan'} <span>↗</span>
              </button>
              <span className="approval-cost-note">Planning contacts your configured provider; source generation waits for your approval.</span>
            </div>
          </form>

          {task && (
            <section className="builder-task-card" aria-live="polite">
              <div className="builder-task-head"><div><span className={`task-state-dot ${task.status}`} /><strong>{task.kind === 'check' ? `${task.check} validation` : 'Project request'}</strong><small>{task.status.replace('_', ' ').toUpperCase()}</small></div>
                {['planning', 'awaiting_approval', 'generating'].includes(task.status) && <button type="button" onClick={cancelTask}>Cancel</button>}
              </div>
              {task.plan && <div className="project-plan-review">
                <strong>REVIEW PROVIDER PLAN</strong>
                <p>{task.plan.summary}</p>
                <div><b>Technology</b>{task.plan.technology.join(' · ')}</div>
                <div><b>Features</b>{task.plan.features.map((feature) => <span key={feature}>{feature}</span>)}</div>
                <ol>{task.plan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
                {task.status === 'awaiting_approval' && <div className="approval-actions">
                  <button type="button" onClick={() => void respondToPlan(true)}>Approve and generate files</button>
                  <button type="button" onClick={() => void respondToPlan(false)}>Decline plan</button>
                </div>}
              </div>}
              <ol>{task.progress.map((message, index) => <li key={`${task.id}-${index}`}>{message}</li>)}</ol>
              {task.errors.map((message, index) => <p className="builder-error inline" key={`${task.id}-error-${index}`}>{message}</p>)}
            </section>
          )}

          {selectedProject ? (
            <ProjectWorkspace
              onOpenFile={openFile}
              onRollback={rollback}
              onRequestRepair={requestRepair}
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
      <footer className="builder-footer"><span>✳ &nbsp;Intelligence, with intention.</span><span>Execution unavailable · Deployment is not configured</span></footer>
    </main>
  );
}

function ProjectWorkspace({
  project,
  selectedFile,
  fileContent,
  onOpenFile,
  onRequestRepair,
  onRollback,
}: {
  project: Project;
  selectedFile: string;
  fileContent: string;
  onOpenFile: (file: string) => void;
  onRequestRepair: () => void;
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
          <details className="diff-details" key={diff.path}>
            <summary className="diff-row"><code>{diff.path}</code><span className="diff-added">+{diff.added}</span><span className="diff-removed">−{diff.removed}</span><span>lines</span></summary>
            <pre>{diff.patch}</pre>
          </details>
        )) : <p className="no-diff">No generated changes recorded yet.</p>}
      </section>

      <section className="checks-panel">
        <div className="inspector-heading"><strong>VALIDATION</strong><span>Execution unavailable</span></div>
        <div className="check-actions">{checks.map((check) => <button disabled key={check} title="Generated code is not executed in the Worker. Validation is unavailable until a verified isolated execution service is configured." type="button">{check}</button>)}</div>
        {project.checks.length ? project.checks.map((check, index) => (
          <details className="check-result" key={`${check.timestamp}-${index}`}>
            <summary><span className={`check-status ${check.status}`}>{check.status}</span><strong>{check.check}</strong><time>{new Date(check.timestamp).toLocaleString()}</time></summary>
            <pre>{check.output || 'No output.'}</pre>
          </details>
        )) : <p className="no-diff">Validation cannot safely execute generated code in this Worker. Configure and verify an isolated execution service before enabling these checks. Preview: {project.previewStatus.replace('_', ' ')}.</p>}
        {project.checks[0]?.status === 'failed' && project.repairAttempts < 1 && (
          <button className="repair-button" type="button" onClick={onRequestRepair}>Attempt one AI repair</button>
        )}
        {project.repairAttempts > 0 && <p className="no-diff">AI repair budget used: {project.repairAttempts}/1.</p>}
      </section>

      <section className="logs-panel">
        <div className="inspector-heading"><strong>TASK LOG</strong><span>Recent events</span></div>
        {project.logs.map((log, index) => <p key={`${log.timestamp}-${index}`}><time>{new Date(log.timestamp).toLocaleTimeString()}</time>{log.message}</p>)}
      </section>

      <section className="deployment-panel">
        <div className="inspector-heading"><strong>DEPLOYMENT CONFIGURATION DRAFT</strong><span>Not deployed</span></div>
        <pre>{JSON.stringify(project.deploymentDraft, null, 2)}</pre>
        <p>Choose a hosting target and review environment requirements before any deployment. This draft performs no deployment.</p>
      </section>
    </section>
  );
}
