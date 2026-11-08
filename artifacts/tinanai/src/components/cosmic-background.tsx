const STAR_COUNT = 22;

export function CosmicBackground() {
  return (
    <div className="cosmic-backdrop" aria-hidden="true">
      <div className="cosmic-nebula cosmic-nebula-cyan" />
      <div className="cosmic-nebula cosmic-nebula-violet" />
      <div className="cosmic-nebula cosmic-nebula-blue" />
      <svg className="cosmic-orbits" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <g className="cosmic-orbit cosmic-orbit-slow" stroke="url(#cosmic-spectrum)">
          <ellipse cx="720" cy="440" rx="530" ry="248" />
          <ellipse cx="720" cy="440" rx="415" ry="198" transform="rotate(-25 720 440)" />
          <ellipse cx="720" cy="440" rx="620" ry="310" transform="rotate(19 720 440)" />
          <path d="M92 650C360 486 475 628 707 438S1125 268 1344 99" />
          <path d="M52 252C331 399 471 301 704 469S1123 657 1390 453" />
        </g>
        <g className="cosmic-orbit cosmic-orbit-reverse" stroke="rgba(122,183,255,.34)">
          <polygon points="168,174 189,162 211,174 211,198 189,210 168,198" />
          <polygon points="1222,242 1243,230 1265,242 1265,266 1243,278 1222,266" />
          <polygon points="1082,658 1101,647 1120,658 1120,680 1101,691 1082,680" />
        </g>
        <defs>
          <linearGradient id="cosmic-spectrum" x1="100" y1="150" x2="1320" y2="740" gradientUnits="userSpaceOnUse">
            <stop stopColor="#44dfff" stopOpacity=".12" />
            <stop offset=".53" stopColor="#9384ff" stopOpacity=".4" />
            <stop offset="1" stopColor="#44dfff" stopOpacity=".12" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cosmic-stars">
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={`cosmic-star${i % 4 === 0 ? ' cosmic-star-violet' : ''}`}
            style={{
              left: `${(i * 43 + 9) % 100}%`,
              top: `${(i * 67 + 12) % 100}%`,
              animationDelay: `${-((i * 7) % 16)}s`,
              animationDuration: `${9 + (i % 7) * 2}s`,
            }}
          />
        ))}
      </div>
      <div className="cosmic-vignette" />
    </div>
  );
}
