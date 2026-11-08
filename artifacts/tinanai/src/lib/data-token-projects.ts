import { z } from 'zod';
import { isAddress, zeroAddress } from 'viem';

const recipient = z.string().refine((value) => value === '' || (isAddress(value) && value.toLowerCase() !== zeroAddress), 'Enter a valid nonzero recipient address.');
export const dataProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  symbol: z.string().trim().regex(/^[A-Z0-9]{2,12}$/, 'Use 2–12 uppercase letters or numbers.'),
  description: z.string().trim().max(2000),
  metadataUri: z.string().trim().max(512).refine((value) => !value || /^(https:\/\/|ipfs:\/\/|ar:\/\/)\S+$/i.test(value), 'Use a public HTTPS, IPFS or Arweave URI.'),
  standard: z.enum(['ERC-20', 'ERC-1155']),
  supply: z.string().regex(/^[1-9]\d{0,77}$/, 'Supply must be a positive whole number.'),
  decimals: z.number().int().min(0).max(18),
  access: z.enum(['public', 'holders', 'allowlist']),
  allowlist: z.string().max(4500),
  usage: z.enum(['read-only', 'commercial', 'custom']),
  usageTerms: z.string().trim().max(2000),
  royaltyBps: z.number().int().min(0).max(10000),
  royaltyRecipient: recipient,
  rewardBps: z.number().int().min(0).max(10000),
  rewardRecipient: recipient,
}).superRefine((input, ctx) => {
  if (/^[1-9]\d{0,77}$/.test(input.supply) && Number.isInteger(input.decimals) && input.decimals >= 0 && input.decimals <= 18
    && BigInt(input.supply) * 10n ** BigInt(input.decimals) > (1n << 256n) - 1n) {
    ctx.addIssue({ code: 'custom', path: ['supply'], message: 'Supply in base units exceeds uint256.' });
  }
  if (input.standard === 'ERC-1155' && input.decimals !== 0) ctx.addIssue({ code: 'custom', path: ['decimals'], message: 'ERC-1155 editions use zero decimals.' });
  if (input.usage === 'custom' && !input.usageTerms) ctx.addIssue({ code: 'custom', path: ['usageTerms'], message: 'Describe the custom usage rights.' });
  for (const kind of ['royalty', 'reward'] as const) {
    if (input[`${kind}Bps`] > 0 && !input[`${kind}Recipient`]) ctx.addIssue({ code: 'custom', path: [`${kind}Recipient`], message: 'A recipient is required when this rule is enabled.' });
  }
  if (input.access === 'allowlist') {
    const addresses = input.allowlist.split(/[\s,]+/).filter(Boolean);
    if (!addresses.length || addresses.length > 100 || addresses.some((address) => !isAddress(address) || address.toLowerCase() === zeroAddress)) {
      ctx.addIssue({ code: 'custom', path: ['allowlist'], message: 'Provide 1–100 valid, nonzero wallet addresses.' });
    }
  }
});
export type DataProjectInput = z.infer<typeof dataProjectInputSchema>;
export const dataProjectSchema = z.object({
  id: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  input: dataProjectInputSchema,
});
export type DataProject = z.infer<typeof dataProjectSchema>;
export const defaultDataProject: DataProjectInput = {
  name: '', symbol: '', description: '', metadataUri: '', standard: 'ERC-20',
  supply: '1000000', decimals: 18, access: 'holders', allowlist: '', usage: 'read-only',
  usageTerms: '', royaltyBps: 0, royaltyRecipient: '', rewardBps: 0, rewardRecipient: '',
};
export const dataProjectStorageKey = (account?: string | null) => `tinanai.data-projects.v1:${account?.toLowerCase() ?? 'guest'}`;
export function readDataProjects(storage: Pick<Storage, 'getItem'>, account?: string | null): DataProject[] {
  const text = storage.getItem(dataProjectStorageKey(account));
  return text ? z.array(dataProjectSchema).max(100).parse(JSON.parse(text)) : [];
}
export function writeDataProjects(storage: Pick<Storage, 'setItem'>, projects: DataProject[], account?: string | null) {
  const validated = z.array(dataProjectSchema).max(100).parse(projects);
  storage.setItem(dataProjectStorageKey(account), JSON.stringify(validated));
}
export function reviewDataProject(input: DataProjectInput, chainId: number) {
  const validated = dataProjectInputSchema.parse(input);
  if (![1, 11155111].includes(chainId)) throw new Error('Choose Ethereum or Sepolia for the proposed deployment.');
  return {
    input: validated, chainId, baseUnits: (BigInt(validated.supply) * 10n ** BigInt(validated.decimals)).toString(),
    status: 'blocked' as const, canDeploy: false as const,
    reason: 'No reviewed data-token factory is deployed or approved. This is a design review, not a transaction. TinanAiCore only registers proofs.',
    factoryAddress: null, calldata: null, gasEstimate: null,
  };
}
