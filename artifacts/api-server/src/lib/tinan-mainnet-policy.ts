import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getAddress, isAddress, zeroAddress } from "viem";
import { tokenArtifact, tokenBuild } from "@workspace/tinanai-contracts/token-artifact";

export function validDeployer(value: string | null | undefined): string | null {
  return value && isAddress(value, { strict: true }) && getAddress(value) !== zeroAddress ? getAddress(value) : null;
}
export function validCatalogEndpoint(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search
      && url.pathname.endsWith("/api/tinanai/payments/catalog");
  } catch { return false; }
}
export function tokenSourceStatus() {
  const sourcePath = ["lib/tinanai-contracts/contracts/TinanAiToken.sol", "../../lib/tinanai-contracts/contracts/TinanAiToken.sol"]
    .map(file => path.resolve(file)).find(existsSync);
  if (!sourcePath) return { status: "BLOCKED" as const, detail: "Reviewed Token source is unavailable for comparison with compiler provenance." };
  try {
    const sourceMatches = createHash("sha256").update(readFileSync(sourcePath)).digest("hex") === tokenBuild.sourceSha256;
    const forbidden = tokenArtifact.abi.some(item => item.type === "function" && ["mint", "burn", "owner", "pause", "upgradeTo", "setTax"].includes(item.name));
    const valid = sourceMatches && tokenBuild.compilerVersion === "0.8.38" && tokenBuild.optimizer.enabled
      && tokenBuild.optimizer.runs === 200 && tokenBuild.evmVersion === "cancun"
      && tokenArtifact.bytecode.length > 2 && tokenArtifact.deployedBytecode.length > 2 && !forbidden;
    return { status: valid ? "PASS" as const : "FAIL" as const,
      detail: valid ? "Reviewed source SHA-256 matches compiler input; solc 0.8.38, optimizer 200, Cancun, Token-only ABI and bytecode. This is build provenance, not an independent security audit."
        : "Token source, compiler settings, ABI or bytecode provenance does not match the reviewed build." };
  } catch { return { status: "BLOCKED" as const, detail: "Token source comparison could not be completed." }; }
}
