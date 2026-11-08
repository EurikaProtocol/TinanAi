import { useCallback, useEffect, useRef, useState } from "react";
import DocumentProofWorkflow, {
  type RegistrationResult,
  type RegistrySnapshot,
  type SelectedProofFile,
  type VerificationResult,
} from "@/components/document-proof-workflow";
import {
  EUREKA_CORE,
  EUREKA_CORE_SELECTORS,
  classifyWalletTransactionError,
  compareProofHash,
  decodeAbiAddressResult,
  decodeAbiBoolResult,
  decodeAbiStringResult,
  decodeAbiUintResult,
  decodeGetProofResult,
  encodeGetProofCall,
  encodeRegisterProofCall,
  findRegisteredProofId,
  getRegistryWorkflowStatus,
  hashProofFile,
  isWalletAuthorized,
  isPublicContentId,
  matchesVerifiedRegistryDeployment,
  type Eip1193Provider,
  type RegistryWorkflowStatus,
} from "@/lib/eureka-core";

// AppKit owns Window.ethereum's broad SDK declaration. Narrow only at this boundary.
const injectedProofProvider = () => window.ethereum as unknown as Eip1193Provider | undefined;

const MAX_LOCAL_FILE_BYTES = 50 * 1024 * 1024;
const EMPTY_REGISTRATION: RegistrationResult = { state: "idle" };
const EMPTY_VERIFICATION: VerificationResult = { state: "idle" };

interface RegistryInspection {
  status: RegistryWorkflowStatus;
  chainId: string;
  authorized: boolean | null;
  registry: RegistrySnapshot | null;
  error?: string;
}

interface TransactionReceipt {
  status?: unknown;
  blockNumber?: unknown;
  to?: unknown;
  from?: unknown;
  logs?: Array<{ address?: unknown; topics?: unknown }>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} returned an invalid value.`);
  return value;
}

function normalizeChainId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    return null;
  }
}

function parseAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((account): account is string =>
    typeof account === "string" && /^0x[a-f0-9]{40}$/i.test(account),
  );
}

function shortError(value: unknown): string {
  if (value instanceof Error && value.message) return value.message.slice(0, 240);
  return "The wallet or registry request failed.";
}

async function readRegistry(
  provider: Eip1193Provider,
  account: string,
): Promise<RegistryInspection> {
  const chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
  if (!chainId) {
    return { status: "unavailable", chainId: "", authorized: null, registry: null, error: "The wallet did not return a valid chain ID." };
  }
  if (chainId !== EUREKA_CORE.chainIdHex) {
    return { status: "wrong-network", chainId, authorized: null, registry: null };
  }

  const code = asString(await provider.request({
    method: "eth_getCode",
    params: [EUREKA_CORE.address, "latest"],
  }), "Contract code");
  if (!/^0x[0-9a-f]+$/i.test(code) || code === "0x") {
    return { status: "unavailable", chainId, authorized: null, registry: null, error: "No contract code is deployed at the verified registry address on this network." };
  }

  const call = async (data: string) => asString(await provider.request({
    method: "eth_call",
    params: [{ to: EUREKA_CORE.address, data }, "latest"],
  }), "Registry read");
  const [nameValue, versionValue, manifestValue, ownerValue, tokenValue, linkValue, countValue, ingestorValue] =
    await Promise.all([
      call(EUREKA_CORE_SELECTORS.name),
      call(EUREKA_CORE_SELECTORS.version),
      call(EUREKA_CORE_SELECTORS.manifest),
      call(EUREKA_CORE_SELECTORS.owner),
      call(EUREKA_CORE_SELECTORS.eurekaToken),
      call(EUREKA_CORE_SELECTORS.eurekaLink),
      call(EUREKA_CORE_SELECTORS.proofCount),
      call(`${EUREKA_CORE_SELECTORS.isIngestor}${account.slice(2).toLowerCase().padStart(64, "0")}`),
    ]);

  const name = decodeAbiStringResult(nameValue);
  const version = decodeAbiStringResult(versionValue);
  const manifest = decodeAbiStringResult(manifestValue);
  const owner = decodeAbiAddressResult(ownerValue);
  const eurekaToken = decodeAbiAddressResult(tokenValue);
  const eurekaLink = decodeAbiAddressResult(linkValue);
  const proofCount = decodeAbiUintResult(countValue).toString();
  const ingestor = decodeAbiBoolResult(ingestorValue);
  const interfaceVerified = matchesVerifiedRegistryDeployment({
    name,
    version,
    manifest,
    owner,
    eurekaToken,
    eurekaLink,
  });
  const authorized = isWalletAuthorized(account, owner, ingestor);
  const registry: RegistrySnapshot = {
    address: EUREKA_CORE.address,
    chainId: "1",
    networkName: EUREKA_CORE.networkName,
    name,
    version,
    manifest,
    proofCount,
    owner,
    eurekaToken,
    eurekaLink,
    tokenMismatch: eurekaToken.toLowerCase() !== EUREKA_CORE.suppliedTokenAddress.toLowerCase(),
  };
  const status = getRegistryWorkflowStatus({
    chainId,
    hasContractCode: true,
    interfaceVerified,
    authorized,
  });
  return {
    status,
    chainId,
    authorized,
    registry,
    error: interfaceVerified ? undefined : "The live contract metadata does not match the verified deployment. Transactions are disabled.",
  };
}

function toHex(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[a-f0-9]{64}$/i.test(value)) return null;
  return value;
}

function toBlockNumber(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try {
    return BigInt(value).toString();
  } catch {
    return null;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForReceipt(
  provider: Eip1193Provider,
  transactionHash: string,
): Promise<TransactionReceipt | null> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const currentChainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
    if (currentChainId !== EUREKA_CORE.chainIdHex) return null;
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [transactionHash],
    });
    if (receipt && typeof receipt === "object") return receipt as TransactionReceipt;
    await sleep(2_000);
  }
  return null;
}

export default function DocumentProofController() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistryWorkflowStatus>("idle");
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [file, setFile] = useState<SelectedProofFile | null>(null);
  const [hashing, setHashing] = useState(false);
  const [proofId, setProofId] = useState("");
  const [label, setLabel] = useState("");
  const [dataCid, setDataCid] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [registration, setRegistration] = useState<RegistrationResult>(EMPTY_REGISTRATION);
  const [verification, setVerification] = useState<VerificationResult>(EMPTY_VERIFICATION);
  const [error, setError] = useState<string | null>(null);
  const hashGeneration = useRef(0);
  const walletAvailable = typeof window !== "undefined" && Boolean(window.ethereum);

  const inspectAndSet = useCallback(async (
    provider: Eip1193Provider,
    targetAccount: string,
  ): Promise<RegistryInspection> => {
    setStatus("reading");
    setError(null);
    try {
      const result = await readRegistry(provider, targetAccount);
      setChainId(result.chainId || null);
      setRegistry(result.registry);
      setAuthorized(result.authorized);
      setStatus(result.status);
      setError(result.error ?? null);
      return result;
    } catch (readError) {
      const actualChain = normalizeChainId(await provider.request({ method: "eth_chainId" }).catch(() => null));
      setChainId(actualChain);
      setRegistry(null);
      setAuthorized(null);
      setStatus(actualChain && actualChain !== EUREKA_CORE.chainIdHex ? "wrong-network" : "unavailable");
      setError(`Registry verification failed: ${shortError(readError)}`);
      return {
        status: actualChain && actualChain !== EUREKA_CORE.chainIdHex ? "wrong-network" : "unavailable",
        chainId: actualChain ?? "",
        authorized: null,
        registry: null,
      };
    }
  }, []);

  const connect = useCallback(async () => {
    const provider = injectedProofProvider();
    if (!provider) {
      setStatus("idle");
      setError("No browser wallet with EIP-1193 support was found.");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = parseAccounts(await provider.request({ method: "eth_requestAccounts" }));
      const nextAccount = accounts[0] ?? null;
      if (!nextAccount) throw new Error("The wallet did not return an account.");
      setAccount(nextAccount);
      await inspectAndSet(provider, nextAccount);
    } catch (connectError) {
      setStatus("idle");
      setError(shortError(connectError));
    }
  }, [inspectAndSet]);

  const refresh = useCallback(async () => {
    const provider = injectedProofProvider();
    if (!provider) {
      setAccount(null);
      setChainId(null);
      setRegistry(null);
      setAuthorized(null);
      setStatus("idle");
      setError("No browser wallet with EIP-1193 support was found.");
      return;
    }
    try {
      const accounts = parseAccounts(await provider.request({ method: "eth_accounts" }));
      const nextAccount = accounts[0] ?? null;
      setAccount(nextAccount);
      if (!nextAccount) {
        const currentChain = normalizeChainId(await provider.request({ method: "eth_chainId" }));
        setChainId(currentChain);
        setRegistry(null);
        setAuthorized(null);
        setStatus(currentChain && currentChain !== EUREKA_CORE.chainIdHex ? "wrong-network" : "idle");
        setError(null);
        return;
      }
      await inspectAndSet(provider, nextAccount);
    } catch (refreshError) {
      setStatus("unavailable");
      setError(`Wallet refresh failed: ${shortError(refreshError)}`);
    }
  }, [inspectAndSet]);

  useEffect(() => {
    const provider = injectedProofProvider();
    if (!provider) return undefined;
    void refresh();
    const onAccountsChanged = (value: unknown) => {
      const nextAccount = parseAccounts(value)[0] ?? null;
      setAccount(nextAccount);
      setRegistry(null);
      setAuthorized(null);
      if (!nextAccount) {
        setStatus("idle");
        setError(null);
      } else {
        void inspectAndSet(provider, nextAccount);
      }
    };
    const onChainChanged = (value: unknown) => {
      setChainId(normalizeChainId(value));
      setRegistry(null);
      setAuthorized(null);
      if (account) void inspectAndSet(provider, account);
      else setStatus(normalizeChainId(value) === EUREKA_CORE.chainIdHex ? "idle" : "wrong-network");
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [account, inspectAndSet, refresh]);

  const selectFile = async (selected: File | null) => {
    const generation = ++hashGeneration.current;
    setFile(null);
    setAcknowledged(false);
    setRegistration(EMPTY_REGISTRATION);
    setVerification(EMPTY_VERIFICATION);
    setError(null);
    if (!selected) {
      setHashing(false);
      return;
    }
    if (selected.size > MAX_LOCAL_FILE_BYTES) {
      setHashing(false);
      setError("Choose a file no larger than 50 MB. The original file is processed only in this browser.");
      return;
    }
    setHashing(true);
    try {
      const digests = await hashProofFile(selected);
      if (generation !== hashGeneration.current) return;
      setFile({
        name: selected.name,
        size: selected.size,
        mimeType: selected.type || "application/octet-stream",
        sha256: digests.sha256,
        bytes32: digests.bytes32,
      });
      setLabel((current) => current || selected.name.replace(/\.[^.]+$/, "").slice(0, 80));
    } catch (hashError) {
      if (generation === hashGeneration.current) setError(`Local SHA-256 hashing failed: ${shortError(hashError)}`);
    } finally {
      if (generation === hashGeneration.current) setHashing(false);
    }
  };

  const clearFile = () => {
    hashGeneration.current += 1;
    setFile(null);
    setHashing(false);
    setAcknowledged(false);
    setRegistration(EMPTY_REGISTRATION);
    setVerification(EMPTY_VERIFICATION);
    setError(null);
  };

  const verify = async () => {
    const provider = injectedProofProvider();
    if (!provider || !file || !registry || chainId !== EUREKA_CORE.chainIdHex) {
      setError("Connect a wallet on Ethereum Mainnet and select the original file before verifying.");
      return;
    }
    if (!/^[1-9][0-9]*$/.test(proofId)) {
      setError("Enter a proof ID greater than zero.");
      return;
    }
    setError(null);
    setVerification({ state: "loading", proofId });
    try {
      const latestChainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
      if (latestChainId !== EUREKA_CORE.chainIdHex) throw new Error("The wallet changed networks. Switch to Ethereum Mainnet and retry.");
      const encodedId = BigInt(proofId);
      if (encodedId >= 1n << 256n) throw new Error("The proof ID is outside the uint256 range.");
      const result = asString(await provider.request({
        method: "eth_call",
        params: [{ to: EUREKA_CORE.address, data: encodeGetProofCall(encodedId) }, "latest"],
      }), "Proof verification");
      const stored = decodeGetProofResult(result);
      const matches = compareProofHash(stored.dataHash, file.sha256);
      setVerification({
        state: matches ? "match" : "mismatch",
        proofId: encodedId.toString(),
        storedHash: stored.dataHash,
        localHash: file.bytes32,
        submitter: stored.submitter,
        dataCid: stored.dataCid,
        label: stored.label,
        timestamp: new Date(Number(stored.timestamp) * 1000).toISOString(),
        redacted: stored.redacted,
        message: matches ? "The local file hash matches the proof stored on Ethereum." : "The hashes differ. This file does not match the selected proof.",
      });
    } catch (verifyError) {
      const message = shortError(verifyError);
      setVerification({ state: "failed", proofId, message });
      setError(`Proof verification failed: ${message}`);
    }
  };

  const register = async () => {
    const provider = injectedProofProvider();
    if (!provider || !file || hashing || !label.trim() || !acknowledged) {
      setError("Select a file, finish hashing, enter a public label, and acknowledge the permanence warning.");
      return;
    }
    if (dataCid.length > 300 || label.trim().length > 80) {
      setError("Keep the public label within 80 characters and CID within 300 characters.");
      return;
    }
    if (!isPublicContentId(dataCid)) {
      setError("Use a public IPFS or Arweave content ID only. URL-style and private links are not accepted.");
      return;
    }
    if (status !== "ready" || !authorized || !account) {
      setError("Registration is unavailable until the connected wallet is authorized on the verified network.");
      return;
    }
    let transactionHash: string | null = null;
    try {
      setError(null);
      setRegistration({ state: "submitting", message: "Rechecking network, contract identity, and wallet authorization." });
      const accounts = parseAccounts(await provider.request({ method: "eth_accounts" }));
      const activeAccount = accounts[0] ?? null;
      if (!activeAccount || activeAccount.toLowerCase() !== account.toLowerCase()) {
        throw new Error("The active wallet account changed. Refresh the wallet status and retry.");
      }
      const current = await inspectAndSet(provider, activeAccount);
      if (current.status !== "ready" || current.authorized !== true || !current.registry) {
        throw new Error(current.error ?? "The wallet is no longer authorized for this registry.");
      }
      const currentChainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
      if (currentChainId !== EUREKA_CORE.chainIdHex) throw new Error("The wallet is no longer on Ethereum Mainnet.");

      const data = encodeRegisterProofCall(file.bytes32, dataCid.trim(), label.trim());
      const sent = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: activeAccount,
          to: EUREKA_CORE.address,
          data,
          value: "0x0",
        }],
      });
      transactionHash = toHex(sent);
      if (!transactionHash) throw new Error("The wallet returned an invalid transaction hash.");
      const explorerUrl = `${EUREKA_CORE.explorerTransactionUrl}${transactionHash}`;
      setRegistration({
        state: "confirming",
        txHash: transactionHash,
        explorerUrl,
        message: "Transaction submitted. Waiting for a mined receipt and matching ProofRegistered event.",
      });

      let receipt: TransactionReceipt | null = null;
      try {
        receipt = await waitForReceipt(provider, transactionHash);
      } catch {
        setRegistration({
          state: "confirming",
          txHash: transactionHash,
          explorerUrl,
          message: "Transaction submitted, but this wallet could not return a receipt. Check the explorer before retrying.",
        });
        return;
      }
      if (!receipt) {
        setRegistration({
          state: "confirming",
          txHash: transactionHash,
          explorerUrl,
          message: "Transaction is still pending or the wallet network changed. Check the explorer before retrying.",
        });
        return;
      }
      if (receipt.status !== "0x1" || String(receipt.to ?? "").toLowerCase() !== EUREKA_CORE.address.toLowerCase()) {
        setRegistration({
          state: "failed",
          txHash: transactionHash,
          explorerUrl,
          blockNumber: toBlockNumber(receipt.blockNumber) ?? undefined,
          message: "The transaction was mined but did not succeed at the expected registry. No proof was confirmed.",
        });
        return;
      }
      const proofIdFromEvent = findRegisteredProofId(
        receipt.logs ?? [],
        EUREKA_CORE.address,
        activeAccount,
        file.bytes32,
      );
      if (!proofIdFromEvent) {
        setRegistration({
          state: "failed",
          txHash: transactionHash,
          explorerUrl,
          blockNumber: toBlockNumber(receipt.blockNumber) ?? undefined,
          message: "The transaction was mined, but a matching ProofRegistered event was not found. Registration is not being reported as successful.",
        });
        return;
      }
      const stored = decodeGetProofResult(asString(await provider.request({
        method: "eth_call",
        params: [{ to: EUREKA_CORE.address, data: encodeGetProofCall(BigInt(proofIdFromEvent)) }, "latest"],
      }), "Registered proof verification"));
      if (!compareProofHash(stored.dataHash, file.sha256) || stored.submitter.toLowerCase() !== activeAccount.toLowerCase()) {
        setRegistration({
          state: "failed",
          proofId: proofIdFromEvent,
          txHash: transactionHash,
          explorerUrl,
          blockNumber: toBlockNumber(receipt.blockNumber) ?? undefined,
          message: "The event was found, but the on-chain proof did not match the local file and wallet. Registration is not being reported as successful.",
        });
        return;
      }
      const blockNumber = toBlockNumber(receipt.blockNumber) ?? undefined;
      setProofId(proofIdFromEvent);
      setVerification({
        state: "match",
        proofId: proofIdFromEvent,
        storedHash: stored.dataHash,
        localHash: file.bytes32,
        submitter: stored.submitter,
        dataCid: stored.dataCid,
        label: stored.label,
        timestamp: new Date(Number(stored.timestamp) * 1000).toISOString(),
        redacted: stored.redacted,
        message: "The mined proof matches the original file hash.",
      });
      setRegistration({
        state: "success",
        proofId: proofIdFromEvent,
        txHash: transactionHash,
        explorerUrl,
        blockNumber,
        message: "Proof registration confirmed from the mined transaction event and read back from the registry.",
      });
      setAcknowledged(false);
      await inspectAndSet(provider, activeAccount);
    } catch (transactionError) {
      const message = transactionHash
        ? "The transaction was submitted, but confirmation could not be verified. Check the transaction hash before retrying."
        : classifyWalletTransactionError(transactionError);
      setRegistration({
        state: "failed",
        txHash: transactionHash ?? undefined,
        explorerUrl: transactionHash ? `${EUREKA_CORE.explorerTransactionUrl}${transactionHash}` : undefined,
        message,
      });
      setError(message);
    }
  };

  return (
    <DocumentProofWorkflow
      walletAvailable={walletAvailable}
      account={account}
      status={status}
      chainId={chainId}
      registry={registry}
      authorized={authorized}
      file={file}
      hashing={hashing}
      proofId={proofId}
      label={label}
      dataCid={dataCid}
      acknowledged={acknowledged}
      registration={registration}
      verification={verification}
      error={error}
      onConnect={() => void connect()}
      onRefresh={() => void refresh()}
      onSelectFile={(selected) => void selectFile(selected)}
      onProofIdChange={setProofId}
      onLabelChange={setLabel}
      onDataCidChange={setDataCid}
      onAcknowledge={setAcknowledged}
      onRegister={() => void register()}
      onVerify={() => void verify()}
      onClearFile={clearFile}
    />
  );
}
