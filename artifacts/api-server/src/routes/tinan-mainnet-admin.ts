import { Router } from "express";
import { keccak256 } from "viem";
import { tokenArtifact, tokenBuild } from "@workspace/tinanai-contracts/token-artifact";
import { HISTORICAL_TINAN_ADDRESSES, NEW_MAINNET_TARGET_ID, assertNewMainnetIdentity } from "@workspace/tinanai-contracts/mainnet-identity";
import { GetTinanMainnetConfigResponse, UpdateTinanMainnetConfigBody, GetTinanMainnetDiagnosticsResponse } from "@workspace/api-zod";
import { mainnetConfig, saveMainnetApproval } from "../lib/tinan-mainnet-config";
import { deploymentRecords } from "../lib/tinan-mainnet-preflight";
import { tokenSourceStatus } from "../lib/tinan-mainnet-policy";
import { diagnoseMainnetRpc } from "../lib/tinan-mainnet-diagnostics";

// Mounted only behind both Clerk authentication and the payment administrator gate.
const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get("/", async (_req, res) => {
  res.json(GetTinanMainnetConfigResponse.parse(await mainnetConfig()));
});
router.put("/", async (req, res) => {
  const input = UpdateTinanMainnetConfigBody.strict().parse(req.body);
  res.json(GetTinanMainnetConfigResponse.parse(await saveMainnetApproval(res.locals.paymentOwnerId, input.approvedDeployer, input.revision)));
});
router.get("/diagnostics", async (_req, res) => {
  const configuration = await mainnetConfig();
  const source = tokenSourceStatus();
  const records = deploymentRecords();
  const creationBytecodeHash = keccak256(tokenArtifact.bytecode);
  const runtimeBytecodeHash = keccak256(tokenArtifact.deployedBytecode);
  let identityMatches = true;
  try { assertNewMainnetIdentity(tokenBuild.sourceSha256, creationBytecodeHash, runtimeBytecodeHash); }
  catch { identityMatches = false; }
  const rpc = await diagnoseMainnetRpc(process.env.TINANAI_MAINNET_RPC_URL, configuration.approvedDeployer);
  res.json(GetTinanMainnetDiagnosticsResponse.parse({
    checkedAt: new Date().toISOString(), targetId: NEW_MAINNET_TARGET_ID,
    sourceSha256: tokenBuild.sourceSha256, creationBytecodeHash, runtimeBytecodeHash,
    historicalContracts: [...HISTORICAL_TINAN_ADDRESSES],
    approvedDeployer: configuration.approvedDeployer, gasSimulationEnabled: false, rpc,
    checks: [
      { id: "source", label: "Reviewed new-token source and bytecode", status: identityMatches ? source.status : "FAIL", detail: identityMatches ? source.detail : "Artifact identity differs from the reviewed new token.", mandatory: true },
      { id: "approved", label: "Saved deployer", status: configuration.approvedDeployer ? "PASS" : "BLOCKED", detail: configuration.approvedDeployer ? "Administrator-approved public address found by SELECT only." : "No approved deployer is saved.", mandatory: true },
      { id: "allowlist", label: "Deployer allowlist", status: configuration.cliDeployerMatches ? "PASS" : "BLOCKED", detail: configuration.cliDeployerMatches ? "Server allowlist matches saved approval." : "Allowlist is missing or differs from saved approval.", mandatory: true },
      { id: "journals", label: "New deployment duplicate / interruption guard", status: records.checked && !records.blockers.length && !records.addresses.length ? "PASS" : "BLOCKED", detail: records.blockers.join(" ") || (records.addresses.length ? "An existing Mainnet deployment record requires reconciliation; no new deployment permitted." : records.checked ? "Available journals inspected. Unknown external deployments are not ruled out." : "Deployment journals unavailable."), mandatory: true },
      { id: "rpc", label: "Server Mainnet diagnostics", status: rpc.status, detail: rpc.detail, mandatory: true },
      { id: "gas", label: "Creation-code simulation", status: "BLOCKED", detail: "Disabled. Separate explicit simulation authorization is required. This endpoint cannot estimate gas.", mandatory: true },
    ],
  }));
});
// Retired: the old endpoint mixed simulation, payment readiness and audit writes.
router.post("/preflight", (_req, res) => {
  res.status(409).json({ error: "Legacy preflight disabled. Use GET mainnet/diagnostics: no simulation or audit write." });
});
export default router;
