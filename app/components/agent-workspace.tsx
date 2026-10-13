'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type PlanStep = {
  id: string;
  title: string;
  description: string;
  permission: 'READ' | 'CREATE' | 'TEST' | 'PRODUCTION' | 'FINANCIAL';
  tool: { name: string; arguments: Record<string, unknown> } | null;
};

type AgentTask = {
  id: string;
  objective: string;
  status: 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'failed' | 'cancelled';
  provider: 'demo' | 'openai-compatible';
  simulated: boolean;
  plan: PlanStep[];
  summary: string;
  selectedTools: string[];
  toolResults: { tool: string; status: string; summary: string; data?: unknown }[];
  progressEvents: { status: string; message: string; timestamp: string }[];
  filesChanged: string[];
  testResult: null;
  errors: string[];
  approvalRequired: boolean;
  approvalHistory: { approved: boolean; timestamp: string }[];
};

type ConversationEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  task?: AgentTask;
};

const suggestions = [
  'Plan a landing page for my project',
  'Review the steps to test an ERC-20 contract',
  'Help me organize a new project',
];

const navigation = [
  { label: 'Dashboard', icon: '⌂', view: 'dashboard' as const },
  { label: 'AI workspace', icon: '✳', view: 'workspace' as const },
];

const unavailablePages = ['Projects', 'Tokenize', 'Wallet', 'Tokens', 'Contracts', 'Deploy', 'Verify', 'Community', 'Docs', 'Settings'];

export default function AgentWorkspace() {
  const [view, setView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<'demo' | 'openai-compatible' | 'unconfigured'>('unconfigured');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [conversation, setConversation] = useState<ConversationEntry[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Tell me what you want to accomplish. When a server-side provider is configured, TINAN can request a model-generated plan and run only registered, permission-checked read/proposal tools. Otherwise, demo mode is explicit and simulated.',
    },
  ]);

  const replaceTask = useCallback((updated: AgentTask) => {
    setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
    setConversation((entries) => entries.map((entry) => entry.task?.id === updated.id
      ? { ...entry, task: updated }
      : entry));
  }, []);

  useEffect(() => {
    const activeTasks = tasks.filter((task) => task.status === 'planning' || task.status === 'executing');
    if (activeTasks.length === 0) return;
    const timer = window.setInterval(() => {
      activeTasks.forEach(async (task) => {
        try {
          const response = await fetch(`/api/agent/tasks/${encodeURIComponent(task.id)}`);
          if (response.ok) {
            const payload = await response.json();
            replaceTask(payload.task as AgentTask);
          }
        } catch {
          setError('Could not refresh task status. Check the server connection.');
        }
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [tasks, replaceTask]);

  useEffect(() => {
    fetch('/api/agent/tasks')
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.provider === 'unconfigured' || !payload?.providerConfigured) {
          setProvider('unconfigured');
          setError('Provider setup is incomplete or invalid. Review server-side TINAN_AI_* settings.');
        } else if (payload?.provider === 'openai-compatible' || payload?.provider === 'demo') {
          setProvider(payload.provider);
        }
      })
      .catch(() => setError('Could not read server provider status.'));
  }, []);

  async function respondToTask(taskId: string, action: 'approval' | 'cancel', approved?: boolean) {
    setError('');
    try {
      const response = action === 'cancel'
        ? await fetch(`/api/agent/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' })
        : await fetch(`/api/agent/tasks/${encodeURIComponent(taskId)}/approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved }),
        });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Task update failed.');
      replaceTask(payload.task as AgentTask);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Task update failed.');
    }
  }

  async function submitObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objective = input.trim();
    if (!objective || isSubmitting) return;

    setError('');
    setIsSubmitting(true);
    setInput('');
    setConversation((entries) => [
      ...entries,
      { id: `user-${Date.now()}`, role: 'user', content: objective },
    ]);

    try {
      const response = await fetch('/api/agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'The planning request could not be completed.');
      }

      const task = payload.task as AgentTask;
      setProvider(payload.provider);
      setTasks((current) => [task, ...current]);
      setConversation((entries) => [
        ...entries,
        {
          id: task.id,
          role: 'assistant',
          content: task.simulated
            ? 'Demo mode returned a simulated task. No model provider or tools were called.'
            : 'The configured provider is preparing a plan. Only registered safe tools can execute; other actions stay blocked pending review.',
          task,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unexpected planning error.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="TINAN AI home">
          <span className="brand-mark">T</span>
          <span className="brand-copy"><strong>TINAN</strong><small>Natural Intelligence</small></span>
        </Link>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${view === item.view ? 'selected' : ''}`}
              key={item.label}
              onClick={() => setView(item.view)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              {view === item.view && <span className="nav-current" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div className="workspace-label tools-label">MORE TO EXPLORE</div>
        <nav className="primary-nav" aria-label="Planned features">
          {unavailablePages.map((page) => (
            page === 'Projects'
              ? <Link className="nav-item planned-item" href="/projects" key={page}><span className="nav-icon" aria-hidden="true">◇</span>Project Builder<span className="planned-label">BETA</span></Link>
              : <button className="nav-item planned-item" disabled key={page} title={`${page} is planned, not available yet`}>
                <span className="nav-icon" aria-hidden="true">◇</span>{page}
                <span className="planned-label">PLANNED</span>
              </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="demo-indicator"><span className="status-dot" />Demo provider active</div>
          <p>Simulated planning only.<br />No external AI provider connected.</p>
          <div className="profile-row"><span className="avatar">E</span><span><strong>Local workspace</strong><small>Development mode</small></span></div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{view === 'dashboard' ? 'Overview' : 'AI workspace'}</strong></div>
          <div className="topbar-actions">
            <span className="provider-pill"><span className="status-dot" />{providerLabel(provider)}</span>
            <button className="help-button" type="button" title="Help and documentation are planned" disabled>?</button>
          </div>
        </header>

        <div className="content-area">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />YOUR INTELLIGENCE WORKSPACE</div>
              <h1>{view === 'dashboard' ? 'Good to see you.' : 'What are we building?'}</h1>
              <p>{view === 'dashboard' ? 'A thoughtful place to turn ideas into actionable plans.' : 'Describe a goal and TINAN will shape it into a clear plan.'}</p>
            </div>
            <div className="date-label"><span className="live-pulse" />AGENT WORKSPACE · PROCESS LOCAL</div>
          </div>

          {view === 'dashboard' && (
            <section className="stats-grid" aria-label="Workspace activity">
              <article className="stat-card">
                <div className="stat-top"><span>PLANS CREATED</span><span className="stat-icon">≡</span></div>
                <strong>{tasks.length.toString().padStart(2, '0')}</strong>
                <small>In this session</small>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span>ACTIVE TASKS</span><span className="stat-icon">◷</span></div>
                <strong>{tasks.filter((task) => ['planning', 'executing', 'awaiting_approval'].includes(task.status)).length.toString().padStart(2, '0')}</strong>
                <small>Planning, executing, or awaiting approval</small>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span>CONNECTED PROVIDERS</span><span className="stat-icon">⌘</span></div>
                <strong>{provider === 'unconfigured' ? '00' : '01'}</strong>
                <small>{provider === 'demo' ? 'Demo · simulated responses' : provider === 'unconfigured' ? 'Provider setup required' : 'Server-side provider configured'}</small>
              </article>
            </section>
          )}

          <div className="workspace-grid">
            <section className="chat-panel" aria-label="Agent planning workspace">
              <div className="panel-heading">
                <div className="agent-identity"><span className="agent-orb">✳</span><span><strong>TINAN Agent</strong><small><span className="status-dot" /> Ready to plan</small></span></div>
                <div className="model-chip"><span className="model-icon">✧</span>{provider === 'demo' ? 'Demo planner' : provider === 'unconfigured' ? 'Provider unavailable' : 'Configured provider'} <span className="chevron">⌄</span></div>
              </div>

              <div className="conversation" aria-live="polite" aria-relevant="additions">
                {conversation.map((entry) => (
                  <article className={`message ${entry.role}`} key={entry.id}>
                    {entry.role === 'assistant' && <span className="message-avatar">✳</span>}
                    <div className="message-body">
                      <div className="message-meta">{entry.role === 'assistant' ? 'TINAN' : 'YOU'} <span>·</span> {entry.role === 'assistant' ? provider === 'demo' ? 'DEMO PLANNER' : provider === 'unconfigured' ? 'PROVIDER UNAVAILABLE' : 'AI PROVIDER' : 'JUST NOW'}</div>
                      <p>{entry.content}</p>
                      {entry.task && <TaskPlanCard task={entry.task} onRespond={respondToTask} />}
                    </div>
                  </article>
                ))}
                {isSubmitting && (
                  <div className="thinking-state" role="status"><span className="thinking-dots"><i /><i /><i /></span>{provider === 'demo' ? 'Preparing simulated plan…' : provider === 'unconfigured' ? 'Checking provider configuration…' : 'Planning and checking permitted tools…'}</div>
                )}
              </div>

              {conversation.length === 1 && (
                <div className="suggestions">
                  <span>START WITH AN IDEA</span>
                  <div>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setInput(suggestion)} type="button">{suggestion}<span>↗</span></button>)}</div>
                </div>
              )}

              <form className="composer" onSubmit={submitObjective}>
                {error && <p className="form-error" role="alert">{error}</p>}
                <label className="visually-hidden" htmlFor="objective">Describe what you want to accomplish</label>
                <textarea
                  id="objective"
                  maxLength={2000}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Describe what you want to accomplish…"
                  rows={2}
                  value={input}
                />
                <div className="composer-footer">
                  <span>{provider === 'demo' ? 'Demo plans are simulated; no tools run.' : provider === 'unconfigured' ? 'Configure a server-side provider before planning.' : 'Only registered, permission-checked safe tools may run.'}</span>
                  <button className="send-button" disabled={!input.trim() || isSubmitting} type="submit">
                    {isSubmitting ? 'Planning…' : 'Create plan'} <span aria-hidden="true">↑</span>
                  </button>
                </div>
              </form>
            </section>

            <aside className="insights-column">
              <section className="insight-card security-card">
                <div className="card-heading"><span className="card-icon shield-icon">⬡</span><span>SAFE BY DESIGN</span><span className="info-mark" title="Demo plans do not run tools or change files">i</span></div>
                <h2>Human approval<br />comes first.</h2>
                <p>Actions involving production, money, or destructive changes are flagged for explicit approval.</p>
                <div className="security-rule"><span className="rule-icon">✓</span> No autonomous execution</div>
                <div className="security-rule"><span className="rule-icon">✓</span> No keys or credentials stored</div>
              </section>

              <section className="insight-card recent-card">
                <div className="recent-heading"><h2>Recent plans</h2><span>{tasks.length.toString().padStart(2, '0')}</span></div>
                {tasks.length === 0 ? (
                  <div className="empty-recent"><span className="empty-icon">◌</span><p>Your plans will appear here.<br />Create a plan to get started.</p></div>
                ) : (
                  <ul className="recent-list">
                    {tasks.slice(0, 4).map((task) => (
                      <li key={task.id}><span className="recent-task-icon">≡</span><span className="recent-task-copy"><strong>{task.objective}</strong><small>PLAN READY · {task.plan.length} STEPS</small></span></li>
                    ))}
                  </ul>
                )}
                <div className="history-note"><span>↗</span> Process-local history · not durable</div>
              </section>
            </aside>
          </div>

          <footer className="page-footer"><span>✳ &nbsp;Intelligence, with intention.</span><span>All plans require human review before action.</span></footer>
        </div>
      </section>
    </main>
  );
}

function TaskPlanCard({ task, onRespond }: {
  task: AgentTask;
  onRespond: (taskId: string, action: 'approval' | 'cancel', approved?: boolean) => void;
}) {
  return (
    <section className="plan-card" aria-label={`Plan for ${task.objective}`}>
      <div className="plan-card-header"><span><span className="plan-check">✓</span> {task.status.replace('_', ' ').toUpperCase()}</span><span className="task-id">{task.id.slice(0, 8)}</span></div>
      <p className="task-summary">{task.summary || (task.status === 'planning' ? 'Waiting for a plan…' : '')}</p>
      <h3>{task.objective}</h3>
      <ol>
        {task.plan.map((step) => (
          <li key={step.id}>
            <span className="step-number">{step.id}</span>
            <span className="step-copy"><strong>{step.title}</strong><small>{step.description}</small></span>
            <span className={`permission-tag ${step.permission.toLowerCase()}`}>{step.permission}</span>
            {step.tool && <span className="tool-label">{step.tool.name}</span>}
          </li>
        ))}
      </ol>
      {task.approvalRequired && task.status === 'awaiting_approval' && (
        <div className="approval-actions">
          <div className="approval-notice"><span>!</span> Explicit approval required before proceeding.</div>
          <button type="button" onClick={() => onRespond(task.id, 'approval', true)}>{task.simulated ? 'Approve simulated plan' : 'Approve safe tools'}</button>
          <button type="button" onClick={() => onRespond(task.id, 'approval', false)}>Decline</button>
        </div>
      )}
      {(task.status === 'planning' || task.status === 'executing') && (
        <button className="cancel-task" type="button" onClick={() => onRespond(task.id, 'cancel')}>Cancel task</button>
      )}
      {task.errors.map((message, index) => <div className="task-error" key={`${task.id}-error-${index}`}>{message}</div>)}
      {task.toolResults.map((result, index) => (
        <div className={`tool-result ${result.status}`} key={`${task.id}-tool-${index}`}>
          <strong>{result.tool}</strong> · {result.status} — {result.summary}
        </div>
      ))}
      <div className="simulation-note"><span>ⓘ</span> {task.simulated ? 'Simulated plan · No tools run · No files changed' : 'Model-generated plan · Registered safe tools only · No shell or file writes'}</div>
    </section>
  );
}

function providerLabel(provider: 'demo' | 'openai-compatible' | 'unconfigured'): string {
  if (provider === 'demo') return 'Demo · simulated';
  if (provider === 'openai-compatible') return 'OpenAI-compatible';
  return 'Provider setup required';
}
