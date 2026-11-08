import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createPublicClient, encodeAbiParameters, formatEther, getAddress, http, keccak256, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { tokenArtifact } from "@workspace/tinanai-contracts/token-artifact";
import { isConfirmedHistoricalRecord } from "@workspace/tinanai-contracts/mainnet-identity";
import type { TinanMainnetConfig, TinanMainnetWallet, TinanMainnetReport, TinanReadinessCheck } from "@workspace/api-zod";
import { validDeployer, validCatalogEndpoint, tokenSourceStatus } from "./tinan-mainnet-policy";
import { validatePaymentToken, quoteAtomic } from "./tinan-payment-chain";
export { validDeployer } from "./tinan-mainnet-policy";

export function deploymentRecords(directory = [path.resolve("lib/tinanai-contracts/deployments"), path.resolve("../../lib/tinanai-contracts/deployments")].find(existsSync)) {
  const result = { checked: false, addresses: [] as string[], blockers: [] as string[] };
  if (!directory) {
    result.blockers.push("Workspace deployment journals are unavailable. An operator must review known deployment records.");
    return result;
  }
  try {
    for (const name of readdirSync(directory)) {
      if (name === "mainnet.lock" || name.endsWith(".json.tmp")) result.blockers.push("An interrupted deployment lock or temporary journal requires operator review.");
      if (!name.endsWith(".json")) continue;
      const record = JSON.parse(readFileSync(path.join(directory, name), "utf8"));
      if (name === "mainnet.json" && Number(record.chainId) !== 1) result.blockers.push("Mainnet journal has an invalid or missing chain ID.");
      if (Number(record.chainId) !== 1 && !["mainnet", "ethereum mainnet"].includes(String(record.network).toLowerCase())) continue;
       if (name !== "mainnet.json" && isConfirmedHistoricalRecord(record)) continue;
      if (record.status !== "confirmed") result.blockers.push("An unconfirmed or uncertain Mainnet journal requires reconciliation before readiness can pass.");
      const address = validDeployer(record.tokenAddress ?? record.contractAddress ?? record.token?.address);
      if (address) result.addresses.push(address);
      else result.blockers.push("A Mainnet record without a confirmed token address requires review.");
    }
    result.checked = true;
  } catch {
    result.blockers.push("Deployment records could not be safely inspected.");
  }
  return result;
}

export async function readOnlyMainnetPreflight(
  config: Pick<TinanMainnetConfig, "approvedDeployer" | "cliDeployerConfigured" | "cliDeployerMatches" | "catalogUrlConfigured">,
  wallet: TinanMainnetWallet,
  payment: { enabled: boolean; chainId: number; tokenAddress: string | null; confirmations?: number; treasuryAddress?: string | null; tinanPerEur?: string | null; rateSource?: string } | undefined,
  records: ReturnType<typeof deploymentRecords>,
  env: NodeJS.ProcessEnv = process.env,
  makeClient: (url: string) => PublicClient = (url) => createPublicClient({ chain: mainnet, transport: http(url, { timeout: 10_000, retryCount: 0 }) }),
): Promise<TinanMainnetReport> {
  const approved = validDeployer(config.approvedDeployer);
  const connected = validDeployer(wallet.connectedAddress);
  const addressesMatch = Boolean(approved && connected && approved === connected);
  const checks: TinanReadinessCheck[] = [];
  const check = (id: string, label: string, status: TinanReadinessCheck["status"], detail: string, mandatory = true) => {
    const result = { id, label, status, detail, mandatory };
    const index = checks.findIndex(item => item.id === id);
    if (index < 0) checks.push(result); else checks[index] = result;
  };
  const existingAddresses = [...records.addresses];
  const report: TinanMainnetReport = {
    ready: false, checkedAt: new Date().toISOString(), blockers: [], checks,
    infrastructureConfigured: false, tokenVerified: null, paymentConfigured: false, checkoutEnabled: Boolean(payment?.enabled), approvedDeployer: approved,
    connectedAddress: connected, addressesMatch, chainId: null, balanceEth: null,
    estimatedGas: null, gasLimit: null, estimatedCostEth: null, maximumCostEth: null,
    creationBytecodeHash: keccak256(tokenArtifact.bytecode), runtimeBytecodeHash: keccak256(tokenArtifact.deployedBytecode),
    constructorArguments: approved ? encodeAbiParameters([{ type: "address" }], [getAddress(approved)]) : null,
    existingAddresses, deploymentRecordsChecked: records.checked,
    paymentCheckoutDisabled: Boolean(payment && !payment.enabled),
  };
  const finish = () => {
    const infrastructureIds = ["approved", "allowlist", "catalog", "source", "journals", "rpc", "network", "confirmations"];
    report.infrastructureConfigured = infrastructureIds.every(id => checks.find(item => item.id === id)?.status === "PASS");
    try {
      report.paymentConfigured = Boolean(payment && payment.chainId === 1 && validDeployer(payment.tokenAddress) && validDeployer(payment.treasuryAddress)
        && payment.tokenAddress?.toLowerCase() !== payment.treasuryAddress?.toLowerCase() && payment.tinanPerEur
        && quoteAtomic(100, payment.tinanPerEur) && payment.rateSource?.trim() && report.tokenVerified === true);
    } catch { report.paymentConfigured = false; }
    check("paymentConfigured", "Complete verified payment configuration", report.paymentConfigured ? "PASS" : "BLOCKED",
      report.paymentConfigured ? "Mainnet token, recipient, amount/rate source and exact token verification are complete. Checkout remains disabled."
        : "A verified Mainnet TINAN token, distinct recipient, positive conversion rate and rate source are required. Missing values are not defaults to invent.");
    report.blockers = checks.filter(item => item.mandatory && item.status !== "PASS").map(item => item.detail);
    report.ready = report.blockers.length === 0;
    return report;
  };
  check("approved", "Administrator-approved deployer", approved ? "PASS" : "BLOCKED", approved ? "Nonzero public address is saved in administrator configuration." : "Approve a nonzero deployer address in administrator configuration.");
  check("allowlist", "Configured deployer matches approval", config.cliDeployerConfigured && config.cliDeployerMatches ? "PASS" : "BLOCKED",
    config.cliDeployerConfigured && config.cliDeployerMatches ? "Guarded CLI allowlist matches the saved approval." : "Set TINANAI_MAINNET_AUTHORIZED_DEPLOYER to the same administrator-approved address; it is missing or does not match.");
  const catalogValid = config.catalogUrlConfigured && validCatalogEndpoint(env.TINANAI_MAINNET_PAYMENT_CATALOG_URL);
  check("catalog", "Payment catalog endpoint", catalogValid ? "PASS" : "BLOCKED", catalogValid ? "A credential-free HTTPS payment-catalog URL is configured; this read-only check does not initialize or fetch catalog data." : "Set a valid HTTPS TINANAI_MAINNET_PAYMENT_CATALOG_URL ending in /api/tinanai/payments/catalog. Values are never echoed.");
  const source = tokenSourceStatus();
  check("source", "Exact Token source and compiled bytecode", source.status, source.detail);
  check("constructor", "Token-only constructor", approved ? "PASS" : "BLOCKED", approved ? "Only TinanAiToken creation bytecode; initialHolder is the approved deployer. Fixed 100,000,000 TINAN / 18 decimals; no Core deployment." : "An approved deployer is required to encode the constructor.");
  check("wallet", "WalletConnect session", connected && wallet.connectorType === "walletConnect" ? "PASS" : "BLOCKED", connected && wallet.connectorType === "walletConnect" ? "Client reports an existing WalletConnect account; no signature was requested." : "Connect the approved WalletConnect account locally; a WalletConnect connection is required.");
  check("walletMatch", "Connected account matches approval", addressesMatch ? "PASS" : connected ? "FAIL" : "BLOCKED", addressesMatch ? "Client-reported account matches the approved deployer." : "Connected wallet does not match the approved deployer or is unavailable.");
  check("walletNetwork", "Wallet network", wallet.walletChainId === 1 ? "PASS" : wallet.walletChainId ? "FAIL" : "BLOCKED", wallet.walletChainId === 1 ? "Client reports Ethereum Mainnet chain ID 1." : "The connected wallet must report Ethereum Mainnet chain ID 1.");
  check("ownership", "Cryptographic wallet ownership", "NOT_TESTED", "Read-only account observations are not proof of ownership. No signature is authorized in this task.", false);
  check("journals", "Deployment journal and interruption review", records.checked && !records.blockers.length ? "PASS" : "BLOCKED",
    records.checked && !records.blockers.length ? "Available known deployment journals were inspected; no interrupted Mainnet record found." : records.blockers.join(" ") || "Known deployment records have not been completely checked.");
  check("confirmations", "Payment confirmation policy", payment && Number.isInteger(payment.confirmations) && payment.confirmations! >= 12 && payment.confirmations! <= 100 ? "PASS" : "BLOCKED",
    payment && payment.confirmations! >= 12 && payment.confirmations! <= 100 ? "Configured confirmation count is between 12 and 100." : "Payment configuration must require an integer between 12 and 100 confirmations.");
  check("checkout", "Checkout remains disabled", report.paymentCheckoutDisabled ? "PASS" : "FAIL", report.paymentCheckoutDisabled ? "Checkout is disabled; deployment preparation cannot activate payments." : "Payment checkout must remain disabled and configuration must exist.");
  check("paymentNetwork", "Payment Mainnet chain ID", payment?.chainId === 1 ? "PASS" : "BLOCKED",
    payment?.chainId === 1 ? "Payment configuration uses Ethereum Mainnet chain ID 1." : "Payment configuration is not set to Ethereum Mainnet.");
  const paymentToken = validDeployer(payment?.tokenAddress);
  check("paymentToken", "Accepted payment token address", payment?.chainId === 1 && paymentToken ? "PASS" : "BLOCKED",
    payment?.chainId === 1 && paymentToken ? "An administrator-configured Mainnet token address is present; deployment verification is a separate mandatory check."
      : "No approved Mainnet payment token address is configured. Compilation does not establish deployment.");
  const recipient = validDeployer(payment?.treasuryAddress);
  check("recipient", "Payment recipient", recipient && recipient !== paymentToken ? "PASS" : "BLOCKED",
    recipient && recipient !== paymentToken ? "A valid nonzero recipient distinct from the token contract is configured."
      : "A valid recipient distinct from the payment token is missing. Do not invent a treasury.");
  let amountValid = false;
  try { amountValid = Boolean(payment?.tinanPerEur && quoteAtomic(100, payment.tinanPerEur) && payment.rateSource?.trim()); } catch { /* Invalid configuration must stay blocked. */ }
  check("paymentAmount", "Payment amount / decimals / rate source", amountValid ? "PASS" : "BLOCKED",
    amountValid ? "Positive integer-atomic-unit quotes use the verified token's required 18 decimals and an explicit rate source."
      : "A positive 18-decimal conversion rate and its source are required.");
  check("paymentContract", "Separate payment contract", "PASS", "This integration verifies direct ERC-20 transfers to the saved recipient; no separate payment contract is used.", false);
  if (payment) {
    if (payment.chainId === 1 && payment.tokenAddress) existingAddresses.push(payment.tokenAddress);
  }
  for (const candidate of [env.TINANAI_MAINNET_KNOWN_TOKEN_ADDRESS, env.TINANAI_MAINNET_VERIFY_ADDRESS]) {
    if (candidate) {
      const address = validDeployer(candidate);
      if (address) existingAddresses.push(address);
      else check("knownAddressValidity", "Known address validity", "FAIL", "A configured known Mainnet token address is invalid; review it before proceeding.");
    }
  }
  check("existingToken", "New deployment protection", existingAddresses.length ? "BLOCKED" : "PASS", existingAddresses.length ? "An existing Mainnet token address was found. New deployment is prohibited; verify the existing contract only." : "No token address appears in checked records/settings; this does not exclude unknown external deployments.", !existingAddresses.length);
  check("externalHistory", "Independent deployment-history review", "NOT_TESTED", "An operator must review prior wallet activity and external records before giving the CLI's explicit no-existing-token declaration.", false);
  for (const [id, label] of [["rpc", "RPC connection"], ["network", "RPC Mainnet chain ID"], ["balance", "Approved deployer ETH balance"], ["gas", "Token deployment gas and cost"], ["funds", "Sufficient ETH at maximum fee cap"]]) {
    check(id!, label!, "BLOCKED", `${label} has not completed.`);
  }
  check("onchainToken", "Existing token runtime and metadata", "NOT_TESTED", "No known Mainnet token address to verify on chain. Production readiness requires a verified existing token.", true);
  let url: URL;
  try {
    if (!env.TINANAI_MAINNET_RPC_URL?.trim()) throw new Error();
    url = new URL(env.TINANAI_MAINNET_RPC_URL.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
  } catch {
    check("rpc", "RPC connection", "BLOCKED", "TINANAI_MAINNET_RPC_URL is missing or invalid. Configure an HTTPS RPC in server-side Secrets.");
    return finish();
  }
  // No wallet client, signer, message-signing, or broadcast methods exist here.
  let stage = "Mainnet chain ID";
  try {
    const client = makeClient(url.toString());
    report.chainId = await client.getChainId();
    check("rpc", "RPC connection", "PASS", "Server-side HTTPS RPC responded; endpoint and credentials remain hidden.");
    if (report.chainId !== 1) {
      check("network", "RPC Mainnet chain ID", "FAIL", "Configured RPC is not Ethereum Mainnet chain ID 1.");
      return finish();
    }
    check("network", "RPC Mainnet chain ID", "PASS", "RPC confirms Ethereum Mainnet chain ID 1.");
    if (existingAddresses.length) {
      try {
        const verified = [];
        for (const address of new Set(existingAddresses)) {
          const head = await validatePaymentToken(1, getAddress(address), client);
          verified.push(`${getAddress(address)} at block ${head - 11n}`);
        }
        report.tokenVerified = true;
        check("onchainToken", "Existing token runtime and metadata", "PASS",
          `Exact compiled TinanAiToken runtime; TinanAi / TINAN / 18 decimals / fixed 100,000,000 supply / no owner or mint administration. Verified with at least 12 confirmations: ${verified.join("; ")}. This is the TINAN payment token, not a replacement for EURIKA.`, true);
      } catch {
        report.tokenVerified = false;
        check("onchainToken", "Existing token runtime and metadata", "FAIL", "Known token verification failed or RPC data is unavailable. Do not redeploy or enable checkout.", true);
      }
    }
    if (!approved) return finish();
    stage = "ETH balance";
    const account = getAddress(approved);
    const balance = await client.getBalance({ address: account });
    report.balanceEth = formatEther(balance);
    check("balance", "Approved deployer ETH balance", "PASS", "ETH balance retrieved for the administrator-approved public address.");
    check("gas", "Creation-code simulation", "BLOCKED", "Disabled in read-only preflight. Use only a separately authorized simulation action.");
    check("funds", "Sufficient ETH at maximum fee cap", "BLOCKED", "No creation-code simulation or gas quote was authorized.");
  } catch {
    // RPC/library errors often contain credential-bearing URLs. Never return or log them.
    const id = stage === "Mainnet chain ID" ? "rpc" : stage === "ETH balance" ? "balance" : "gas";
    check(id, stage, "FAIL", `Read-only ${stage} check failed. Check the server-side RPC configuration; provider error details are hidden.`);
  }
  return finish();
}
