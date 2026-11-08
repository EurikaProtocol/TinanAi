/** Reviewed NEW token identity, not either historical TINAN contract. No side effects. */
export const HISTORICAL_TINAN_ADDRESSES = [
  '0x2907A8aB668AD053dE5614C861a080929B4a887f',
  '0x7Fa0393B56629791736aB365dd9849775f955Cd2',
] as const;
export const NEW_TINAN_SOURCE_SHA256 = '658f6be1e98c0ec53903f90e442ba08879e756207a29d948aba06f28466251cd';
export const NEW_TINAN_CREATION_HASH = '0x95594d289f5777b34ea9868fcaf824c537ff3e251846b6250152e6ab60ddb2f2';
export const NEW_TINAN_RUNTIME_HASH = '0x8f5e81a8fddf4446397077f8992d1789d76795c5cdaac0bb6441d2048af35d2a';
export const NEW_MAINNET_TARGET_ID = `tinanai-new-mainnet-token:${NEW_TINAN_SOURCE_SHA256}:${NEW_TINAN_RUNTIME_HASH}`;
export const NEW_MAINNET_DECLARATION = `CREATE NEW SEPARATE TinanAiToken SOURCE ${NEW_TINAN_SOURCE_SHA256} RUNTIME ${NEW_TINAN_RUNTIME_HASH}`;
export const CREATION_SIMULATION_AUTHORIZATION = 'ALLOW_EXACT_TINANAI_CREATION_CODE_SIMULATION';

export function isHistoricalTinanAddress(address: unknown): boolean {
  return typeof address === 'string' && HISTORICAL_TINAN_ADDRESSES.some(item => item.toLowerCase() === address.toLowerCase());
}

/** Only unambiguous, confirmed legacy records may be classified as separate. */
export function isConfirmedHistoricalRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const nested = record.token && typeof record.token === 'object' ? (record.token as Record<string, unknown>).address : undefined;
  const addresses = [record.contractAddress, record.tokenAddress, nested].filter(item => item !== undefined && item !== null);
  if (record.status !== 'confirmed' || record.targetId === NEW_MAINNET_TARGET_ID || !addresses.length) return false;
  if (record.sourceSha256 === NEW_TINAN_SOURCE_SHA256 || record.runtimeBytecodeHash === NEW_TINAN_RUNTIME_HASH
    || record.expectedRuntimeBytecodeHash === NEW_TINAN_RUNTIME_HASH || record.creationBytecodeHash === NEW_TINAN_CREATION_HASH) return false;
  return addresses.every(address => isHistoricalTinanAddress(address)
    && String(address).toLowerCase() === String(addresses[0]).toLowerCase());
}

export function assertNewMainnetIdentity(sourceSha256: string, creationHash: string, runtimeHash: string) {
  if (sourceSha256 !== NEW_TINAN_SOURCE_SHA256 || creationHash !== NEW_TINAN_CREATION_HASH || runtimeHash !== NEW_TINAN_RUNTIME_HASH) {
    throw new Error('Source or bytecode differs from the reviewed NEW TinanAiToken identity. Stop for review; do not deploy.');
  }
}

/** Explicit per-invocation authorization; no default permission or persistent toggle. */
export function assertCreationSimulationAuthorized(authorization: string | undefined) {
  if (authorization !== CREATION_SIMULATION_AUTHORIZATION) {
    throw new Error('Creation-code simulation is disabled. Separate explicit simulation authorization is required; nothing was estimated or sent.');
  }
}
