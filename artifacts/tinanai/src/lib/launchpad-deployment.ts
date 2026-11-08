import { z } from 'zod';
import type { LaunchDraft } from './store';

export const SEPOLIA_ID = 11155111;
export const TOKEN_DECIMALS = 18;
const MAX_UINT256 = (1n << 256n) - 1n;
const DEPLOYMENT_STORAGE_KEY = 'tinanai.launchpad.deployments.v1';

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const launchpadDeploymentSchema = z.object({
  id: z.string().min(1).max(100),
  draftId: z.string().min(1).max(100),
  account: address,
  chainId: z.literal(SEPOLIA_ID),
  name: z.string().min(1).max(64),
  symbol: z.string().regex(/^[A-Z0-9]{2,12}$/),
  initialSupply: z.string().regex(/^\d{1,60}$/).refine((value) => {
    try { parseInitialSupply(value); return true; } catch { return false; }
  }),
  decimals: z.literal(TOKEN_DECIMALS),
  mintable: z.boolean(),
  burnable: z.boolean(),
  txHash,
  contractAddress: address.nullable(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  createdAt: z.string().datetime(),
  message: z.string().max(500).optional(),
}).superRefine((record, context) => {
  if (record.status === 'confirmed' && !record.contractAddress) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['contractAddress'], message: 'Confirmed deployments require a contract address.' });
  }
});

export type LaunchpadDeployment = z.infer<typeof launchpadDeploymentSchema>;
export type DeploymentStorage = Pick<Storage, 'getItem' | 'setItem'>;

const deploymentListSchema = z.array(launchpadDeploymentSchema).max(200);

export function parseInitialSupply(wholeUnits: string): bigint {
  if (!/^\d{1,60}$/.test(wholeUnits)) throw new Error('Supply must be a positive whole number.');
  const supply = BigInt(wholeUnits);
  if (supply <= 0n) throw new Error('Supply must be greater than zero.');
  const baseUnits = supply * (10n ** BigInt(TOKEN_DECIMALS));
  if (baseUnits > MAX_UINT256) throw new Error('Supply is too large for an ERC-20 contract with 18 decimals.');
  return baseUnits;
}

export function deploymentBlockReason(draft: LaunchDraft): string | null {
  if (draft.network !== 'Ethereum' && draft.network !== 'Undecided') {
    return 'This deployment flow is Sepolia-only. Edit the draft network to Ethereum or Undecided before continuing.';
  }
  if (draft.standard !== 'ERC-20') return 'Only ERC-20 drafts can be deployed from this flow.';
  if (draft.decimals !== TOKEN_DECIMALS) {
    return 'This deployment flow uses exactly 18 decimals. Edit the draft decimals to 18 before continuing.';
  }
  try {
    parseInitialSupply(draft.supply);
  } catch (error) {
    return error instanceof Error ? error.message : 'Supply is not valid for deployment.';
  }
  return null;
}

export interface LocalDeploymentRead {
  records: LaunchpadDeployment[];
  error: string | null;
}

export function readLocalDeployments(storage: DeploymentStorage): LocalDeploymentRead {
  try {
    const stored = storage.getItem(DEPLOYMENT_STORAGE_KEY);
    if (!stored) return { records: [], error: null };
    const parsed = deploymentListSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      return { records: [], error: 'Saved deployment history is invalid and has not been overwritten.' };
    }
    return { records: parsed.data, error: null };
  } catch {
    return { records: [], error: 'Saved deployment history could not be read. It has not been overwritten.' };
  }
}

export function writeLocalDeployment(
  record: LaunchpadDeployment,
  storage: DeploymentStorage,
): LocalDeploymentRead {
  const validated = launchpadDeploymentSchema.safeParse(record);
  if (!validated.success) {
    return { records: [], error: 'Deployment history was not saved because the record failed validation.' };
  }
  const current = readLocalDeployments(storage);
  if (current.error) return current;
  const records = [
    validated.data,
    ...current.records.filter((item) => item.id !== validated.data.id),
  ].slice(0, 200);
  try {
    storage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(records));
    return { records, error: null };
  } catch {
    return { records, error: 'Deployment completed, but its history could not be saved in this browser.' };
  }
}

export function deploymentsForAccount(records: LaunchpadDeployment[], account: string | null) {
  if (!account) return [];
  const normalized = account.toLowerCase();
  return records.filter((record) => record.account.toLowerCase() === normalized);
}

export function deploymentFromDraft(
  draft: LaunchDraft,
  account: string,
  txHashValue: string,
  options: { mintable: boolean; burnable: boolean; id: string; createdAt: string },
): LaunchpadDeployment {
  return launchpadDeploymentSchema.parse({
    id: options.id,
    draftId: draft.id,
    account,
    chainId: SEPOLIA_ID,
    name: draft.name,
    symbol: draft.symbol,
    initialSupply: draft.supply,
    decimals: TOKEN_DECIMALS,
    mintable: options.mintable,
    burnable: options.burnable,
    txHash: txHashValue,
    contractAddress: null,
    status: 'pending',
    createdAt: options.createdAt,
  });
}

export function isDraftDeployable(draft: LaunchDraft) {
  return deploymentBlockReason(draft) === null;
}

export const contractCreationSchema = z.object({
  name: z.string().trim().min(1, 'Enter a token name.').max(64),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, 'Use 2–12 letters or numbers.'),
  supply: z.string().trim().superRefine((value, context) => {
    try { parseInitialSupply(value); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid supply.' });
    }
  }),
  description: z.string().trim().max(2000).default(''),
  mintable: z.boolean().default(false),
  burnable: z.boolean().default(false),
});

export type ContractCreationInput = z.infer<typeof contractCreationSchema>;

/** Saves constructor settings, not a deployed contract or an official platform token. */
export function createContractDraft(input: ContractCreationInput, id: string, timestamp: string): LaunchDraft {
  const values = contractCreationSchema.parse(input);
  return {
    ...values, id, kind: 'community', network: 'Ethereum', standard: 'ERC-20',
    decimals: TOKEN_DECIMALS, status: 'Draft', createdAt: timestamp, updatedAt: timestamp,
    description: values.description || 'ERC-20 contract prepared in TINANAI Contract Studio.',
    distribution: 'The entire initial supply is allocated to the connected owner wallet at deployment.',
    website: '', socialLinks: '', sourceDescription: '', provenance: '', issuer: '',
    rights: '', accessModel: 'public', metadataUri: '', integrityHash: '',
  };
}

export function buildContractManifest(draft: LaunchDraft, owner: string | null) {
  const blocked = deploymentBlockReason(draft);
  if (blocked) throw new Error(blocked);
  if (owner !== null && (!address.safeParse(owner).success || /^0x0{40}$/i.test(owner))) {
    throw new Error('Connect a valid, nonzero owner wallet.');
  }
  const baseUnits = parseInitialSupply(draft.supply).toString();
  const mintable = draft.mintable ?? false;
  const burnable = draft.burnable ?? false;
  return {
    schemaVersion: 1,
    notice: 'Prepared settings only. No contract is deployed by generating or downloading this file. Not a security audit or an official platform-token designation.',
    platform: { name: 'TINANAI', module: 'Contract Studio', officialPlatformToken: false },
    chainId: SEPOLIA_ID,
    network: 'Ethereum Sepolia',
    draftId: draft.id,
    contractName: 'TinanToken',
    parameters: {
      name: draft.name, symbol: draft.symbol, initialSupplyWholeTokens: draft.supply,
      initialSupplyBaseUnits: baseUnits, decimals: TOKEN_DECIMALS,
      owner, mintingEnabled: mintable, burningEnabled: burnable,
    },
    constructorArguments: owner ? [draft.name, draft.symbol, baseUnits, owner, mintable, burnable] : null,
    requiresConnectedOwner: owner === null,
    contractAddress: null,
    transactionHash: null,
  };
}
