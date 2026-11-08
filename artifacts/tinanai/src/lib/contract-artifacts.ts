import artifact from '@/generated/tinan-token.json';
import build from '@/generated/tinan-token-build.json';
import { buildContractManifest } from './launchpad-deployment';
import type { LaunchDraft } from './store';

/** Exact build-time source and ABI. User settings are constructor arguments, not source edits. */
export const tokenSource = build.standardInput.sources['TinanToken.sol'].content;
export const tokenAbiJson = JSON.stringify(artifact.abi, null, 2);
export const compilerInputJson = JSON.stringify(build.standardInput, null, 2);
export const compilerVersion = artifact.compilerVersion;

export function exportContractBundle(draft: LaunchDraft, owner: string | null): string {
  return JSON.stringify({
    ...buildContractManifest(draft, owner),
    compilerVersion,
    evmVersion: build.evmVersion,
    optimizer: build.optimizer,
    source: tokenSource,
    abi: artifact.abi,
    creationBytecode: artifact.bytecode,
    standardCompilerInput: build.standardInput,
    dependencies: build.dependencies,
    licenses: build.licenses,
    dependencyNotice: 'OpenZeppelin dependency source notices and license are included. Review the license before redistribution.',
  }, null, 2);
}
