import { AI_API_URL } from './chains';

export type TokenStandard = 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'Data Proof';

export interface Blueprint {
  projectName: string;
  category: string;
  description: string;
  utility: string;
  tokenStandard: TokenStandard;
  recommendedSupply: number;
  decimals: number;
  riskLevel: 'low' | 'medium' | 'high';
  verificationRequired: boolean;
  verificationItems: string[];
  warnings: string[];
  blockchainRecommendation: string;
  tokenizationScore: number; // technical readiness only, NOT an investment score
  symbol?: string; // user-chosen in /create, not produced by the AI
}

export const CATEGORIES = [
  'AI / Data', 'Energy data', 'Community', 'Creator', 'Knowledge', 'Digital collectible', 'Real-world asset', 'Other',
] as const;

export const DISCLAIMER =
  'TINAN AI provides technical guidance only. It does not promise profits, predict prices, confirm legal ownership or verify any asset. You must review everything and sign any transaction yourself.';

const BASE_WARNINGS = [
  'Tokens do not by themselves create legal ownership of any asset.',
  'No returns, profits or token price are implied or guaranteed.',
  'Check the securities and consumer rules that apply in your jurisdiction.',
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// Deterministic, local, rule-based analysis. Used when no AI API is configured or the API fails.
export function localAnalyze(input: string, category?: string): Blueprint {
  const text = input.trim();
  const t = text.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  let cat = category && category !== 'auto' ? category : 'Other';
  if (!category || category === 'auto') {
    if (has('energy', 'solar', 'power', 'kwh')) cat = 'Energy data';
    else if (has('dataset', 'data', 'model', 'ai ')) cat = 'AI / Data';
    else if (has('community', 'dao', 'member')) cat = 'Community';
    else if (has('creator', 'art', 'music', 'video', 'artist')) cat = 'Creator';
    else if (has('course', 'knowledge', 'research', 'paper', 'article')) cat = 'Knowledge';
    else if (has('house', 'real estate', 'land', 'gold', 'car', 'property', 'equity', 'share')) cat = 'Real-world asset';
  }

  let standard: TokenStandard = 'ERC-20';
  if (has('proof', 'hash', 'certificate', 'timestamp') || cat === 'AI / Data' || cat === 'Energy data') standard = 'Data Proof';
  if (has('collectible', 'unique', 'nft', 'artwork', 'art', 'badge', 'ticket') || cat === 'Digital collectible') standard = 'ERC-721';
  if (has('edition', 'multi', 'game item', 'collection of')) standard = 'ERC-1155';
  if (has('utility token', 'fungible', 'currency', 'points', 'credits', 'governance', 'community token')) standard = 'ERC-20';

  const rwa = cat === 'Real-world asset' || has('house', 'real estate', 'land', 'gold', 'equity', 'share', 'invest');
  const warnings = [...BASE_WARNINGS];
  const verificationItems = ['Proof of identity of the project owner', 'Documentation supporting the project description'];
  if (rwa) {
    warnings.push('Real-world assets require legal review and independent verification before any token is issued.');
    verificationItems.push('Proof of legal ownership', 'Independent valuation or audit', 'Legal opinion on token structure');
  }
  if (has('invest', 'profit', 'return', 'yield', 'dividend')) {
    warnings.push('Wording that suggests investment returns may trigger financial regulation. TINAN AI does not offer investment advice.');
  }
  if (standard === 'Data Proof') verificationItems.push('Original data source and licence', 'Data hash (computed locally, never upload secrets)');

  const risk: Blueprint['riskLevel'] = rwa ? 'high' : standard === 'ERC-20' ? 'medium' : 'low';
  let score = 40;
  if (text.length > 40) score += 15;
  if (text.length > 120) score += 10;
  if (category && category !== 'auto') score += 5;
  if (has('utility', 'use', 'access', 'reward', 'governance', 'proof')) score += 15;
  if (rwa) score -= 15;
  score = clamp(score, 5, 95);

  const name = text.split(/[.\n]/)[0].slice(0, 60) || 'Untitled project';
  return {
    projectName: name,
    category: cat,
    description: text || 'No description provided.',
    utility: has('access', 'reward', 'governance', 'proof')
      ? 'Utility described by the owner: ' + text.slice(0, 140)
      : 'Utility not yet defined. Describe what holders can do with the token.',
    tokenStandard: standard,
    recommendedSupply: standard === 'ERC-20' ? 1_000_000 : standard === 'ERC-1155' ? 10_000 : 1,
    decimals: standard === 'ERC-20' ? 18 : 0,
    riskLevel: risk,
    verificationRequired: rwa || risk !== 'low',
    verificationItems,
    warnings,
    blockchainRecommendation:
      'Use an EVM network with low fees for testing first (e.g. Base, Arbitrum or Polygon) and deploy on a testnet before mainnet. Final choice is yours.',
    tokenizationScore: score,
  };
}

// Strip anything that makes forbidden claims from remote output and enforce shape.
export function sanitize(raw: Partial<Blueprint>, fallback: Blueprint): Blueprint {
  const standards: TokenStandard[] = ['ERC-20', 'ERC-721', 'ERC-1155', 'Data Proof'];
  const risks = ['low', 'medium', 'high'];
  const str = (v: unknown, d: string, max = 600) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : d);
  const arr = (v: unknown, d: string[]) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 300)) : d;
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  const decimals = clamp(Math.floor(num(raw.decimals, fallback.decimals)), 0, 18);
  const warnings = Array.from(new Set([...arr(raw.warnings, []), ...BASE_WARNINGS]));
  return {
    projectName: str(raw.projectName, fallback.projectName, 100),
    category: str(raw.category, fallback.category, 60),
    description: str(raw.description, fallback.description),
    utility: str(raw.utility, fallback.utility),
    tokenStandard: standards.includes(raw.tokenStandard as TokenStandard) ? (raw.tokenStandard as TokenStandard) : fallback.tokenStandard,
    recommendedSupply: Math.min(Math.floor(num(raw.recommendedSupply, fallback.recommendedSupply)), 1e12),
    decimals,
    riskLevel: risks.includes(raw.riskLevel as string) ? (raw.riskLevel as Blueprint['riskLevel']) : fallback.riskLevel,
    verificationRequired: typeof raw.verificationRequired === 'boolean' ? raw.verificationRequired : fallback.verificationRequired,
    verificationItems: arr(raw.verificationItems, fallback.verificationItems),
    warnings,
    blockchainRecommendation: str(raw.blockchainRecommendation, fallback.blockchainRecommendation),
    tokenizationScore: clamp(Math.round(num(raw.tokenizationScore, fallback.tokenizationScore)), 0, 100),
  };
}

export async function analyze(input: string, category?: string): Promise<{ blueprint: Blueprint; source: 'ai' | 'local' }> {
  const local = localAnalyze(input, category);
  if (!AI_API_URL) return { blueprint: local, source: 'local' };
  try {
    const res = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input, category }),
    });
    if (!res.ok) throw new Error('AI API ' + res.status);
    return { blueprint: sanitize(await res.json(), local), source: 'ai' };
  } catch {
    return { blueprint: local, source: 'local' };
  }
}
