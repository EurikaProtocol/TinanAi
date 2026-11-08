export const EUREKA_CORE = {
  chainId: 1,
  chainIdHex: "0x1",
  networkName: "Ethereum Mainnet",
  address: "0xA34aDeA96853bc696463bde7Aab4Cd71068E930F",
  suppliedTokenAddress: "0x861a27DBeDcEFc2d0bdFea359431be683D95195b",
  verifiedOwner: "0x5D0435779b10234fD4941cc15fae8C7C86117E91",
  verifiedLinkedToken: "0x4042973c0863CCA0D73F028cA98465F44F0e6F97",
  verifiedLinkedRegistry: "0x5D0435779b10234fD4941cc15fae8C7C86117E91",
  verifiedName: "Eureka Core",
  verifiedVersion: "1.0.0",
  verifiedManifest: "GreenLeaf",
  explorerTransactionUrl: "https://etherscan.io/tx/",
  verifiedSourceUrl: "https://eth.blockscout.com/address/0xA34aDeA96853bc696463bde7Aab4Cd71068E930F?tab=contract",
} as const;

export const EUREKA_CORE_SELECTORS = {
  manifest: "0x38739dad",
  name: "0xa3f4df7e",
  version: "0xffa1ad74",
  eurekaLink: "0xd1a8d5f6",
  eurekaToken: "0x61ff8105",
  getProof: "0x11149ada",
  isIngestor: "0x9822091e",
  owner: "0x8da5cb5b",
  proofCount: "0xaddecc06",
  registerProof: "0x9d408cf5",
  proofRegisteredTopic: "0xd09b2fbdc538134bab28ae0449f8aa9681d665eef6cfce1c72786bdeaf6fc585",
} as const;

export type RegistryWorkflowStatus =
  | "idle"
  | "connecting"
  | "reading"
  | "wrong-network"
  | "unavailable"
  | "ready"
  | "unauthorized";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface RegistryReadiness {
  chainId: string | null;
  hasContractCode: boolean;
  interfaceVerified: boolean;
  authorized: boolean | null;
}

export interface DecodedProof {
  submitter: string;
  dataHash: string;
  dataCid: string;
  label: string;
  timestamp: bigint;
  redacted: boolean;
}

export interface VerifiedRegistryMetadata {
  owner: string;
  eurekaToken: string;
  eurekaLink: string;
  name: string;
  version: string;
  manifest: string;
}

export interface ProofEventLog {
  address?: unknown;
  topics?: unknown;
}

export function matchesVerifiedRegistryDeployment(metadata: VerifiedRegistryMetadata): boolean {
  return metadata.owner.toLowerCase() === EUREKA_CORE.verifiedOwner.toLowerCase() &&
    metadata.eurekaToken.toLowerCase() === EUREKA_CORE.verifiedLinkedToken.toLowerCase() &&
    metadata.eurekaLink.toLowerCase() === EUREKA_CORE.verifiedLinkedRegistry.toLowerCase() &&
    metadata.name === EUREKA_CORE.verifiedName &&
    metadata.version === EUREKA_CORE.verifiedVersion &&
    metadata.manifest === EUREKA_CORE.verifiedManifest;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(
  bytes: Uint8Array,
  subtle: Pick<SubtleCrypto, "digest"> = globalThis.crypto.subtle,
): Promise<string> {
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await subtle.digest("SHA-256", digestInput);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashProofFile(
  file: { arrayBuffer(): Promise<ArrayBuffer> },
  subtle: Pick<SubtleCrypto, "digest"> = globalThis.crypto.subtle,
): Promise<{ sha256: string; bytes32: string }> {
  const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()), subtle);
  return { sha256, bytes32: sha256ToBytes32(sha256) };
}

export function sha256ToBytes32(digest: string): string {
  const clean = digest.replace(/^0x/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw new Error("A SHA-256 digest must contain exactly 32 bytes.");
  }
  return `0x${clean}`;
}

export function isPublicContentId(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  return /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/i.test(candidate) ||
    /^ar:\/\/[A-Za-z0-9_-]{43}$/.test(candidate);
}

export function isWalletAuthorized(
  account: string | null | undefined,
  owner: string | null | undefined,
  isIngestor: boolean,
): boolean {
  if (!account || !/^0x[a-f0-9]{40}$/i.test(account)) return false;
  return account.toLowerCase() === owner?.toLowerCase() || isIngestor;
}

export function getRegistryWorkflowStatus(readiness: RegistryReadiness): RegistryWorkflowStatus {
  if (readiness.chainId !== EUREKA_CORE.chainIdHex) return "wrong-network";
  if (!readiness.hasContractCode || !readiness.interfaceVerified) return "unavailable";
  if (readiness.authorized === null) return "reading";
  return readiness.authorized ? "ready" : "unauthorized";
}

export function compareProofHash(storedHash: string, localSha256: string): boolean {
  try {
    return sha256ToBytes32(storedHash) === sha256ToBytes32(localSha256);
  } catch {
    return false;
  }
}

function uintWord(value: bigint): string {
  if (value < 0n || value >= 1n << 256n) throw new Error("Value is outside the uint256 range.");
  return value.toString(16).padStart(64, "0");
}

function encodeDynamicString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const hex = bytesToHex(bytes);
  const paddedHexLength = Math.ceil(hex.length / 64) * 64;
  return `${uintWord(BigInt(bytes.length))}${hex.padEnd(paddedHexLength, "0")}`;
}

export function encodeRegisterProofCall(dataHash: string, dataCid: string, label: string): string {
  const bytes32 = sha256ToBytes32(dataHash).slice(2);
  const cidTail = encodeDynamicString(dataCid);
  const labelTail = encodeDynamicString(label);
  const cidOffset = 96n;
  const labelOffset = cidOffset + BigInt(cidTail.length / 2);
  return `${EUREKA_CORE_SELECTORS.registerProof}${bytes32}${uintWord(cidOffset)}${uintWord(labelOffset)}${cidTail}${labelTail}`;
}

export function encodeGetProofCall(proofId: bigint): string {
  return `${EUREKA_CORE_SELECTORS.getProof}${uintWord(proofId)}`;
}

function validateHexData(data: string): string {
  const clean = data.replace(/^0x/i, "");
  if (!/^[a-f0-9]*$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error("The contract returned malformed ABI data.");
  }
  return clean.toLowerCase();
}

function wordAt(data: string, byteOffset: number): string {
  const start = byteOffset * 2;
  const word = data.slice(start, start + 64);
  if (word.length !== 64) throw new Error("The contract returned incomplete ABI data.");
  return word;
}

function decodeDynamicString(data: string, offsetWord: string): string {
  const offsetBigInt = BigInt(`0x${offsetWord}`);
  if (offsetBigInt > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The contract returned an invalid string offset.");
  const offset = Number(offsetBigInt);
  const lengthBigInt = BigInt(`0x${wordAt(data, offset)}`);
  if (lengthBigInt > 100_000n) throw new Error("The contract returned an oversized string.");
  const length = Number(lengthBigInt);
  const start = (offset + 32) * 2;
  const encoded = data.slice(start, start + length * 2);
  if (encoded.length !== length * 2) throw new Error("The contract returned an incomplete string.");
  const bytes = Uint8Array.from(encoded.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  return new TextDecoder().decode(bytes);
}

export function decodeAbiStringResult(value: string): string {
  const data = validateHexData(value);
  return decodeDynamicString(data, wordAt(data, 0));
}

export function decodeAbiUintResult(value: string): bigint {
  const data = validateHexData(value);
  return BigInt(`0x${wordAt(data, 0)}`);
}

export function decodeAbiAddressResult(value: string): string {
  const data = validateHexData(value);
  return `0x${wordAt(data, 0).slice(-40)}`;
}

export function decodeAbiBoolResult(value: string): boolean {
  return decodeAbiUintResult(value) !== 0n;
}

export function decodeGetProofResult(value: string): DecodedProof {
  const data = validateHexData(value);
  const submitterWord = wordAt(data, 0);
  const dataHash = `0x${wordAt(data, 32)}`;
  const cidOffset = wordAt(data, 64);
  const labelOffset = wordAt(data, 96);
  const timestamp = BigInt(`0x${wordAt(data, 128)}`);
  const redacted = BigInt(`0x${wordAt(data, 160)}`) !== 0n;
  return {
    submitter: `0x${submitterWord.slice(-40)}`,
    dataHash,
    dataCid: decodeDynamicString(data, cidOffset),
    label: decodeDynamicString(data, labelOffset),
    timestamp,
    redacted,
  };
}

export function findRegisteredProofId(
  logs: readonly ProofEventLog[],
  contractAddress: string,
  submitter: string,
  dataHash: string,
): string | null {
  const normalizedHash = sha256ToBytes32(dataHash).toLowerCase();
  const log = logs.find((candidate) => {
    if (typeof candidate.address !== "string" || candidate.address.toLowerCase() !== contractAddress.toLowerCase()) return false;
    if (!Array.isArray(candidate.topics) || candidate.topics.length < 4) return false;
    const [topic, id, eventSubmitter, eventHash] = candidate.topics;
    return typeof topic === "string" &&
      topic.toLowerCase() === EUREKA_CORE_SELECTORS.proofRegisteredTopic &&
      typeof id === "string" &&
      typeof eventSubmitter === "string" &&
      `0x${eventSubmitter.slice(-40)}`.toLowerCase() === submitter.toLowerCase() &&
      typeof eventHash === "string" &&
      eventHash.toLowerCase() === normalizedHash;
  });
  if (!log || !Array.isArray(log.topics) || typeof log.topics[1] !== "string") return null;
  try {
    return BigInt(log.topics[1]).toString();
  } catch {
    return null;
  }
}

export function classifyWalletTransactionError(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (candidate?.code === 4001 || candidate?.code === "4001") return "The wallet rejected the transaction. No proof was registered.";
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  if (/revert|execution failed|insufficient funds|gas required exceeds allowance/i.test(message)) {
    return "The transaction failed or reverted. No proof was registered.";
  }
  return "The wallet transaction failed. No proof was registered.";
}
