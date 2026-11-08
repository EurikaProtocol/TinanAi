import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  EUREKA_CORE,
  EUREKA_CORE_SELECTORS,
  classifyWalletTransactionError,
  compareProofHash,
  decodeGetProofResult,
  encodeRegisterProofCall,
  findRegisteredProofId,
  getRegistryWorkflowStatus,
  hashProofFile,
  isPublicContentId,
  isWalletAuthorized,
  sha256Hex,
  sha256ToBytes32,
} from "./eureka-core.ts";

test("hashes the original bytes with SHA-256", async () => {
  const digest = await sha256Hex(new TextEncoder().encode("abc"), webcrypto.subtle);
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hashes a browser-style File without transforming its original bytes", async () => {
  const file = new File([new TextEncoder().encode("abc")], "document.txt", { type: "text/plain" });
  const result = await hashProofFile(file, webcrypto.subtle);
  assert.equal(result.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(result.bytes32, "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("accepts public IPFS and Arweave IDs but rejects URLs and malformed IDs", () => {
  assert.equal(isPublicContentId(""), true);
  assert.equal(isPublicContentId(`ipfs://Qm${"a".repeat(44)}`), true);
  assert.equal(isPublicContentId(`ar://${"A".repeat(43)}`), true);
  assert.equal(isPublicContentId("https://private.example/document"), false);
  assert.equal(isPublicContentId("http://127.0.0.1/private"), false);
  assert.equal(isPublicContentId("ipfs://not-a-cid"), false);
});

test("converts the SHA-256 digest to bytes32 without changing its bytes", () => {
  const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(sha256ToBytes32(digest), `0x${digest}`);
  assert.equal(sha256ToBytes32(`0x${digest}`), `0x${digest}`);
  assert.throws(() => sha256ToBytes32("0x1234"), /exactly 32 bytes/);
});

test("encodes registerProof with the verified selector and exact hash", () => {
  const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const call = encodeRegisterProofCall(digest, "ipfs://example", "Quarterly file");
  assert.equal(call.slice(0, 10), EUREKA_CORE_SELECTORS.registerProof);
  assert.equal(call.slice(10, 74), digest);
  assert.equal(BigInt(`0x${call.slice(74, 138)}`), 96n);
  assert.equal(BigInt(`0x${call.slice(138, 202)}`), 160n);
});

test("registration is blocked unless chain, deployed code, ABI, and authorization pass", () => {
  assert.equal(getRegistryWorkflowStatus({
    chainId: EUREKA_CORE.chainIdHex,
    hasContractCode: true,
    interfaceVerified: true,
    authorized: true,
  }), "ready");
  assert.equal(getRegistryWorkflowStatus({
    chainId: "0x2105",
    hasContractCode: true,
    interfaceVerified: true,
    authorized: true,
  }), "wrong-network");
  assert.equal(getRegistryWorkflowStatus({
    chainId: EUREKA_CORE.chainIdHex,
    hasContractCode: false,
    interfaceVerified: true,
    authorized: true,
  }), "unavailable");
  assert.equal(getRegistryWorkflowStatus({
    chainId: EUREKA_CORE.chainIdHex,
    hasContractCode: true,
    interfaceVerified: true,
    authorized: false,
  }), "unauthorized");
});

test("wallet authorization accepts the owner or an authorized ingestor", () => {
  const owner = "0x5d0435779b10234fd4941cc15fae8c7c86117e91";
  const userA = "0x1111111111111111111111111111111111111111";
  const userB = "0x2222222222222222222222222222222222222222";
  assert.equal(isWalletAuthorized(owner.toUpperCase().replace("0X", "0x"), owner, false), true);
  assert.equal(isWalletAuthorized(userA, owner, true), true);
  assert.equal(isWalletAuthorized(userB, owner, false), false);
  assert.equal(isWalletAuthorized(null, owner, true), false);
});

test("proof verification reports a mismatch instead of treating it as success", () => {
  const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(compareProofHash(`0x${digest}`, digest), true);
  assert.equal(compareProofHash(`0x${"0".repeat(64)}`, digest), false);
});

test("decodes proof IDs only from the verified contract event and matching hash", () => {
  const account = "0x1111111111111111111111111111111111111111";
  const digest = `0x${"ab".repeat(32)}`;
  const id = `0x${"0".repeat(63)}7`;
  const log = {
    address: EUREKA_CORE.address,
    topics: [
      EUREKA_CORE_SELECTORS.proofRegisteredTopic,
      id,
      `0x${"0".repeat(24)}${account.slice(2)}`,
      digest,
    ],
  };
  assert.equal(findRegisteredProofId([log], EUREKA_CORE.address, account, digest), "7");
  assert.equal(findRegisteredProofId([log], EUREKA_CORE.address, account, `0x${"cd".repeat(32)}`), null);
  assert.equal(findRegisteredProofId([log], EUREKA_CORE.suppliedTokenAddress, account, digest), null);
});

test("decodes the deployed getProof ABI tuple", () => {
  const word = (value: bigint) => value.toString(16).padStart(64, "0");
  const bytes = (value: string) => Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const dynamic = (value: string) => {
    const encoded = bytes(value);
    return `${word(BigInt(encoded.length / 2))}${encoded.padEnd(Math.ceil(encoded.length / 64) * 64, "0")}`;
  };
  const submitter = "1111111111111111111111111111111111111111";
  const dataHash = "ab".repeat(32);
  const cid = "ipfs://private-choice";
  const label = "example";
  const cidOffset = 192n;
  const cidTail = dynamic(cid);
  const labelOffset = cidOffset + BigInt(cidTail.length / 2);
  const encoded = `0x${"0".repeat(24)}${submitter}${dataHash}${word(cidOffset)}${word(labelOffset)}${word(123n)}${word(1n)}${cidTail}${dynamic(label)}`;
  const proof = decodeGetProofResult(encoded);
  assert.equal(proof.submitter, `0x${submitter}`);
  assert.equal(proof.dataHash, `0x${dataHash}`);
  assert.equal(proof.dataCid, cid);
  assert.equal(proof.label, label);
  assert.equal(proof.timestamp, 123n);
  assert.equal(proof.redacted, true);
});

test("classifies a rejected or reverted wallet transaction as failure", () => {
  assert.match(classifyWalletTransactionError({ code: 4001 }), /rejected/);
  assert.match(classifyWalletTransactionError(new Error("execution reverted")), /failed or reverted/);
  assert.match(classifyWalletTransactionError(new Error("unknown")), /failed/);
});
