import { Router, type IRouter } from "express";
import { GetEurikaOverviewResponse } from "@workspace/api-zod";
import { getCachedResponse, setCachedResponse } from "../lib/api-cache";

const router: IRouter = Router();
const CONTRACT_ADDRESS = "0x4042973c0863CCA0D73F028cA98465F44F0e6F97";
const BLOCKSCOUT_BASE = "https://eth.blockscout.com/api/v2";
const SOURCIFY_URL = `https://sourcify.dev/server/v2/contract/1/${CONTRACT_ADDRESS}`;
const CACHE_KEY = `eurika-overview:v2:mainnet:${CONTRACT_ADDRESS.toLowerCase()}`;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ROWS = 20;

type JsonRecord = Record<string, unknown>;

interface FetchResult {
  available: boolean;
  data: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchJson(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { available: false, data: null };
    return { available: true, data: await response.json() as unknown };
  } catch {
    return { available: false, data: null };
  }
}

function asItems(value: unknown): JsonRecord[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.filter(isRecord).slice(0, MAX_ROWS);
}

function createActivitySeries(
  transactions: Array<{ timestamp: string | null }>,
): Array<{ date: string; transactionCount: number }> {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction.timestamp) continue;
    const date = transaction.timestamp.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, transactionCount]) => ({ date, transactionCount }));
}

router.get("/eurika/overview", async (req, res): Promise<void> => {
  const cached = await getCachedResponse(CACHE_KEY);
  if (cached !== null) {
    const parsedCache = GetEurikaOverviewResponse.safeParse(cached);
    if (parsedCache.success) {
      res.json(parsedCache.data);
      return;
    }
    req.log.warn("Ignoring an invalid cached EURIKA overview response");
  }

  const addressUrl = `${BLOCKSCOUT_BASE}/addresses/${CONTRACT_ADDRESS}`;
  const [addressResult, transactionsResult, logsResult, sourcifyResult] =
    await Promise.all([
      fetchJson(addressUrl),
      fetchJson(`${addressUrl}/transactions`),
      fetchJson(`${addressUrl}/logs`),
      fetchJson(SOURCIFY_URL),
    ]);

  const addressData = isRecord(addressResult.data) ? addressResult.data : null;
  const tokenData =
    addressData && isRecord(addressData.token) ? addressData.token : null;
  const sourcifyData = isRecord(sourcifyResult.data)
    ? sourcifyResult.data
    : null;
  const hasVerifiedMatch = Boolean(
    sourcifyData?.match || sourcifyData?.creationMatch || sourcifyData?.runtimeMatch,
  );
  const isExplorerVerified = addressData?.is_verified === true;

  const transactions = asItems(transactionsResult.data).map((item) => {
    const from = isRecord(item.from) ? item.from : null;
    const to = isRecord(item.to) ? item.to : null;
    return {
      hash: stringOrNull(item.hash) ?? "",
      timestamp: toIsoDate(item.timestamp),
      blockNumber: integerOrNull(item.block_number),
      fromAddress: stringOrNull(from?.hash) ?? "Unavailable",
      toAddress: stringOrNull(to?.hash),
      method: stringOrNull(item.method),
      status: stringOrNull(item.status) ?? "unknown",
      valueWei: stringOrNull(item.value) ?? "0",
    };
  }).filter((item) => item.hash.length > 0);

  const recentLogs = asItems(logsResult.data).flatMap((item) => {
    const transactionHash = stringOrNull(item.transaction_hash);
    if (!transactionHash) return [];
    const topics = Array.isArray(item.topics)
      ? item.topics.filter((topic): topic is string => typeof topic === "string")
      : [];
    return [{
      transactionHash,
      blockNumber: integerOrNull(item.block_number),
      timestamp: toIsoDate(item.timestamp),
      topics,
      data: stringOrNull(item.data) ?? "0x",
    }];
  });

  const verificationStatus = hasVerifiedMatch || isExplorerVerified
    ? "verified"
    : addressResult.available || sourcifyResult.available
      ? "unverified"
      : "unavailable";
  const explorerTokenType = stringOrNull(tokenData?.type);
  const explorerProxyType = stringOrNull(addressData?.proxy_type);
  const explorerImplementations = Array.isArray(addressData?.implementations)
    ? addressData.implementations
    : [];
  const proxyStatus = !addressResult.available
    ? null
    : explorerProxyType || explorerImplementations.length > 0
      ? `Explorer reports proxy metadata (${explorerProxyType ?? "implementation listed"}); source is not verified.`
      : "Explorer reports no proxy indicator; direct deployment is not independently confirmed.";
  const someExplorerDataAvailable =
    addressResult.available || transactionsResult.available || logsResult.available;
  const sourceStatuses = [
    {
      name: "Blockscout contract metadata",
      status: addressResult.available ? "available" : "unavailable",
      detail: addressResult.available
        ? "Explorer metadata returned; this is not verified source code."
        : "Explorer contract metadata could not be retrieved.",
    },
    {
      name: "Blockscout transactions",
      status: transactionsResult.available ? "available" : "unavailable",
      detail: transactionsResult.available
        ? `Up to ${transactions.length} public transaction records returned.`
        : "Transaction history could not be retrieved.",
    },
    {
      name: "Blockscout raw logs",
      status: logsResult.available ? "available" : "unavailable",
      detail: logsResult.available
        ? `Up to ${recentLogs.length} raw log records returned; event interpretations are not ABI-verified.`
        : "Raw contract logs could not be retrieved.",
    },
    {
      name: "Sourcify verification",
      status: sourcifyResult.available ? "available" : "unavailable",
      detail: sourcifyResult.available
        ? hasVerifiedMatch
          ? "Sourcify reports a matching source record."
          : "Sourcify responded but returned no verified source match."
        : "Sourcify verification metadata could not be retrieved.",
    },
  ];

  const availableSourceCount = sourceStatuses.filter(
    (source) => source.status === "available",
  ).length;
  const overview = GetEurikaOverviewResponse.parse({
    contractAddress: CONTRACT_ADDRESS,
    chainName: "Ethereum Mainnet",
    chainId: 1,
    codeStatus: addressResult.available
      ? addressData?.is_contract === true
        ? "deployed"
        : addressData?.is_contract === false
          ? "not_deployed"
          : "unavailable"
      : "unavailable",
    verificationStatus,
    contractType: explorerTokenType,
    contractTypeSource: explorerTokenType ? "explorer_metadata" : "unavailable",
    proxyStatus,
    ownerAddress: null,
    adminAddress: null,
    functionsStatus: "unavailable",
    supportedFunctions: [],
    tokenMetadata: {
      name: stringOrNull(tokenData?.name),
      symbol: stringOrNull(tokenData?.symbol),
      decimals: integerOrNull(tokenData?.decimals),
      totalSupplyRaw: stringOrNull(tokenData?.total_supply),
      holderCount: integerOrNull(tokenData?.holders_count),
      classification: explorerTokenType,
      source: explorerTokenType ? "explorer_metadata" : "unavailable",
    },
    recentTransactions: transactions,
    recentLogs,
    activityByDay: createActivitySeries(transactions),
    sources: sourceStatuses,
    integrationHealth: availableSourceCount === sourceStatuses.length
      ? "operational"
      : availableSourceCount > 0
        ? "limited"
        : "unavailable",
    readCapability: someExplorerDataAvailable
      ? "explorer_data_only"
      : "unavailable",
    writeCapability: "disabled",
    checkedAt: new Date().toISOString(),
  });

  await setCachedResponse(CACHE_KEY, overview);
  res.json(overview);
});

export default router;
