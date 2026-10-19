'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const features = [
  {
    number: '01',
    title: 'AI project planning',
    description: 'Turn a brief into a structured plan you can review before source generation begins.',
    detail: 'Requires a configured server-side provider',
  },
  {
    number: '02',
    title: 'Reviewable projects',
    description: 'Inspect generated files, compare changes, request bounded updates, and roll back safely.',
    detail: 'Source viewer is read-only',
  },
  {
    number: '03',
    title: 'Useful starting points',
    description: 'Explore common project directions for business sites, stores, SaaS, and dashboards.',
    detail: 'Examples, not prebuilt templates',
  },
  {
    number: '04',
    title: 'Private workspace',
    description: 'The current deployment uses one protected owner account with project-level access checks.',
    detail: 'Single-owner authentication',
  },
  {
    number: '05',
    title: 'Safe by default',
    description: 'Generated paths and sizes are checked. Generated code is never run inside the Worker.',
    detail: 'Isolated execution is not configured',
  },
  {
    number: '06',
    title: 'Portable exports',
    description: 'Download project source and a deployment configuration draft to continue elsewhere.',
    detail: 'Deployment is not automatic',
  },
];

const examples = [
  { id: 'business', name: 'Business website', type: 'PRESENT YOUR BUSINESS', accent: 'cyan', shape: 'business' },
  { id: 'services', name: 'Services website', type: 'MAKE YOUR OFFER CLEAR', accent: 'blue', shape: 'services' },
  { id: 'ecommerce', name: 'E-commerce store', type: 'SHOWCASE A CATALOG', accent: 'purple', shape: 'store' },
  { id: 'saas', name: 'SaaS landing page', type: 'INTRODUCE A PRODUCT', accent: 'cyan', shape: 'saas' },
  { id: 'dashboard', name: 'Product dashboard', type: 'ORGANIZE A WORKFLOW', accent: 'blue', shape: 'dashboard' },
];

export default function MarketingHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  function closeMobileNav() {
    setMenuOpen(false);
  }

  return (
    <main className="marketing-shell">
      <header className="marketing-nav">
        <Link className="marketing-brand" href="/" aria-label="TINAN AI home">
          <span className="brand-mark">T</span>
          <span>TINAN <b>AI</b></span>
        </Link>
        <nav id="marketing-mobile-menu" className="marketing-links" aria-label="Main navigation" data-open={menuOpen}>
          <Link href="/" onClick={closeMobileNav}>Home</Link>
          <Link href="/projects" onClick={closeMobileNav}>Project Builder</Link>
          <a href="#templates" onClick={closeMobileNav}>Templates</a>
          <a href="#pricing" onClick={closeMobileNav}>Pricing</a>
          <a href="#about" onClick={closeMobileNav}>About</a>
          <a href="#docs" onClick={closeMobileNav}>Docs</a>
          <div className="mobile-nav-actions">
            <Link className="marketing-signin" href="/workspace" onClick={closeMobileNav}>Sign in</Link>
            <Link className="marketing-button small" href="/projects" onClick={closeMobileNav}>Get started <span aria-hidden="true">↗</span></Link>
          </div>
        </nav>
        <div className="marketing-nav-actions">
          <Link className="marketing-signin" href="/workspace">Sign in</Link>
          <Link className="marketing-button small" href="/projects">Get started <span aria-hidden="true">↗</span></Link>
        </div>
        <button
          ref={menuButton}
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="marketing-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
      </header>

      <section className="marketing-hero">
        <div className="hero-copy">
          <div className="marketing-eyebrow"><i /> YOUR IDEA, BUILT WITH INTENTION</div>
          <h1>Build anything<br />with <span>TINAN AI.</span></h1>
          <p>Go from a spark of an idea to a reviewable web project. Plan with AI, approve the direction, then generate source you can inspect and export.</p>
          <div className="hero-actions">
            <Link className="marketing-button" href="/projects">Start building <span aria-hidden="true">↗</span></Link>
            <Link className="marketing-secondary" href="/workspace"><span aria-hidden="true">▷</span> View demo workspace</Link>
          </div>
          <div className="hero-note"><span className="marketing-status-dot" /> Provider state is shown in the workspace · No simulated code generation</div>
        </div>
        <div className="hero-visual" aria-label="Illustration of a project plan and generated source files">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-glow" />
          <div className="hero-window">
            <div className="window-bar"><span /><span /><span /><i>PROJECT / LANDING PAGE</i></div>
            <div className="window-content">
              <div className="window-sidebar"><b>✳</b><span /><span /><span /><span /></div>
              <div className="window-main">
                <small>PROJECT PLAN · READY FOR REVIEW</small>
                <strong>Launch a better<br />first impression.</strong>
                <p>Responsive product website</p>
                <div className="window-progress"><span /></div>
                <div className="window-lines"><i /><i /><i /></div>
                <div className="window-code"><span>01</span> &lt;section&gt; <b>Build with care</b> &lt;/section&gt;</div>
              </div>
            </div>
          </div>
          <div className="floating-badge plan-badge"><span>✳</span><div><b>Plan prepared</b><small>Review before generation</small></div></div>
          <div className="floating-badge safety-badge"><span>✓</span><div><b>Human approved</b><small>Execution stays isolated</small></div></div>
        </div>
        <div className="hero-footnote"><span>DESCRIBE</span><i /> <span>REVIEW</span><i /> <span>GENERATE</span><i /> <span>EXPORT</span></div>
      </section>

      <section className="marketing-section features-section" id="features">
        <div className="section-heading">
          <div><div className="marketing-eyebrow"><i /> A CLEARER WAY TO BUILD</div><h2>From first thought<br />to a real starting point.</h2></div>
          <p>Useful AI, visible boundaries, and project files you can take with you. No mystery progress bars or hidden execution.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-card-top"><span>{feature.number}</span><b>✳</b></div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <small>{feature.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section process-section" id="how-it-works">
        <div className="section-heading">
          <div><div className="marketing-eyebrow"><i /> A HUMAN-LED WORKFLOW</div><h2>Make every step<br />count.</h2></div>
          <p>Planning and generation are separate requests. You see the plan first; source generation starts only after you approve it.</p>
        </div>
        <div className="process-grid">
          {[
            ['01', 'Describe', 'Share what you want to make and the needs it should serve.'],
            ['02', 'Plan', 'A configured provider returns a structured plan for your review.'],
            ['03', 'Approve & generate', 'Choose whether to proceed. No project files are generated before approval.'],
            ['04', 'Inspect & export', 'Browse the resulting source and download an archive. Execution and deployment remain off.'],
          ].map(([number, title, copy]) => (
            <article className="process-step" key={number}>
              <span>{number}</span><i aria-hidden="true" /><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section gallery-section" id="templates">
        <div className="section-heading">
          <div><div className="marketing-eyebrow"><i /> WHAT WILL YOU MAKE?</div><h2>One idea, many<br />directions.</h2></div>
          <p>Explore a few project types to get your imagination moving. These are examples, not generated previews or downloadable templates.</p>
        </div>
        <div className="project-gallery">
          {examples.map((example, index) => (
            <Link
              className={`gallery-card ${example.accent} ${example.shape}`}
              href={`/projects?template=${example.id}`}
              aria-label={`Start a ${example.name} project from this example`}
              key={example.id}
            >
              <div className="gallery-art" aria-hidden="true">
                <div className="gallery-mock">
                  <i /><i /><i />
                  <b>{['STUDIO NORTH', 'FIELDWORK', 'OBJECTS / 24', 'NOVA PRODUCT', 'WEEKLY OVERVIEW'][index]}</b>
                  <span /><span /><span />
                </div>
                <div className="gallery-orb" />
              </div>
              <div className="gallery-caption"><div><small>{example.type}</small><h3>{example.name}</h3></div><span aria-hidden="true">↗</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="ecosystem-section" id="about">
        <div className="ecosystem-mark" aria-hidden="true">E</div>
        <div><div className="marketing-eyebrow"><i /> BUILT FOR THE EUREKA ECOSYSTEM</div><h2>Ideas deserve<br />a thoughtful path.</h2>
          <p>TINAN AI is part of the Eureka ecosystem: a workspace for shaping ideas into clear plans and portable projects, with people staying in control.</p>
        </div>
        <Link className="marketing-secondary" href="/workspace">Explore the workspace <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="pricing-section" id="pricing">
        <div><div className="marketing-eyebrow"><i /> EARLY ACCESS</div><h2>A workspace, not a billing promise.</h2>
          <p>TINAN AI currently uses a single-owner account. There is no public multi-user signup, paid plan, or service-level commitment yet.</p>
        </div>
        <Link className="marketing-button" href="/workspace">Sign in to your workspace <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="final-cta" id="docs">
        <div className="marketing-eyebrow"><i /> YOUR NEXT PROJECT STARTS HERE</div>
        <h2>Make the idea<br /><span>real enough to review.</span></h2>
        <p>Bring a clear brief. TINAN AI will help shape the next step—with approval before generation.</p>
        <Link className="marketing-button" href="/projects">Start building <span aria-hidden="true">↗</span></Link>
        <a className="documentation-link" href="https://github.com/EurikaProtocol/TinanAi#readme" target="_blank" rel="noreferrer">Read setup & safety docs ↗</a>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/"><span className="brand-mark">T</span><span>TINAN <b>AI</b></span></Link>
        <p>Intelligence, with intention.</p>
        <div><a href="https://github.com/EurikaProtocol/TinanAi" target="_blank" rel="noreferrer">GitHub</a><a href="https://github.com/EurikaProtocol/TinanAi#readme" target="_blank" rel="noreferrer">Documentation</a><span>Privacy · not published</span><span>Terms · not published</span><span>Status · not configured</span></div>
        <small>© {new Date().getFullYear()} TINAN AI · Eureka ecosystem</small>
      </footer>
    </main>
  );
}
