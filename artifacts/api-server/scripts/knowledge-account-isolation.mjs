import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.KNOWLEDGE_API_URL;
const tokenA = process.env.KNOWLEDGE_TEST_ACCOUNT_A_TOKEN;
const tokenB = process.env.KNOWLEDGE_TEST_ACCOUNT_B_TOKEN;

if (!baseUrl || !tokenA || !tokenB) {
  console.error(
    "Set KNOWLEDGE_API_URL, KNOWLEDGE_TEST_ACCOUNT_A_TOKEN, and KNOWLEDGE_TEST_ACCOUNT_B_TOKEN.",
  );
  process.exit(2);
}

const apiUrl = new URL(baseUrl);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname);
const isReplitDev = apiUrl.hostname.endsWith(".replit.dev")
  || apiUrl.hostname.endsWith(".repl.co");
if (!isLocal && !isReplitDev && process.env.KNOWLEDGE_TEST_ALLOW_NONDEV_TARGET !== "true") {
  console.error(
    "Refusing a non-development target. Set KNOWLEDGE_TEST_ALLOW_NONDEV_TARGET=true only when you intend to run against that target.",
  );
  process.exit(2);
}

const accounts = {
  A: { token: tokenA, collection: null, document: null },
  B: { token: tokenB, collection: null, document: null },
};
const marker = randomUUID().replaceAll("-", "");
const accountContent = {
  A: `Private account A isolation test ${marker}. The Ternary Kite protocol stores seven brass lanterns in the vault.`,
  B: `Private account B isolation test ${marker}. The Copper Heron protocol stores nine silver compasses in the archive.`,
};

function endpoint(path) {
  const url = new URL(apiUrl);
  url.pathname = `${apiUrl.pathname.replace(/\/+$/, "")}${path}`;
  return url;
}

async function request(account, method, path, { body, headers = {} } = {}) {
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      Authorization: `Bearer ${accounts[account].token}`,
      ...headers,
    },
    body,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload };
}

function expectStatus(result, status, label) {
  assert.equal(
    result.response.status,
    status,
    `${label}: expected HTTP ${status}, received ${result.response.status}`,
  );
}

async function jsonRequest(account, method, path, value) {
  return request(account, method, path, {
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

async function createCollection(account, name) {
  const result = await jsonRequest(account, "POST", "/collections", {
    name,
    description: `Temporary isolation verification collection ${marker}`,
  });
  expectStatus(result, 201, `Create account ${account} collection`);
  assert.ok(result.payload?.collection?.id, `Account ${account} collection response includes an ID`);
  accounts[account].collection = result.payload.collection;
  console.log(`PASS: account ${account} can create its own collection`);
}

async function uploadDocument(account) {
  const form = new FormData();
  form.append("category", "general");
  form.append("collectionIds", accounts[account].collection.id);
  form.append(
    "file",
    new Blob([accountContent[account]], { type: "text/plain" }),
    `isolation-${account}-${marker}.txt`,
  );
  const result = await request(account, "POST", "/documents", { body: form });
  expectStatus(result, 202, `Upload account ${account} document`);
  assert.ok(result.payload?.document?.id, `Account ${account} document response includes an ID`);
  accounts[account].document = result.payload.document;
  console.log(`PASS: account ${account} can create its own document`);
}

async function waitUntilIndexed(account) {
  const documentId = accounts[account].document.id;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const result = await request(account, "GET", `/documents/${documentId}`);
    expectStatus(result, 200, `Read account ${account} document while indexing`);
    const document = result.payload?.document;
    assert.ok(document, `Account ${account} document response exists`);
    if (document.status === "ready") return document;
    if (document.status === "error") {
      throw new Error(`Account ${account} document indexing failed; check the API server logs.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Account ${account} document did not finish indexing within five minutes.`);
}

async function listDocuments(account) {
  const result = await request(account, "GET", "/documents");
  expectStatus(result, 200, `List account ${account} documents`);
  return result.payload?.documents ?? [];
}

async function listCollections(account) {
  const result = await request(account, "GET", "/collections");
  expectStatus(result, 200, `List account ${account} collections`);
  return result.payload?.collections ?? [];
}

async function verify() {
  const unsigned = await fetch(endpoint("/documents"));
  expectStatus({ response: unsigned }, 401, "Reject unsigned Knowledge Library request");
  console.log("PASS: unsigned Knowledge Library requests are rejected");

  await createCollection("A", `Isolation A ${marker}`);
  await createCollection("B", `Isolation B ${marker}`);
  await uploadDocument("A");
  await uploadDocument("B");

  const [documentA, documentB] = await Promise.all([
    waitUntilIndexed("A"),
    waitUntilIndexed("B"),
  ]);
  assert.equal(documentA.status, "ready");
  assert.equal(documentB.status, "ready");
  console.log("PASS: both accounts finish indexing their own documents");

  const [docsA, docsB, collectionsA, collectionsB] = await Promise.all([
    listDocuments("A"),
    listDocuments("B"),
    listCollections("A"),
    listCollections("B"),
  ]);
  const docIdsA = new Set(docsA.map((document) => document.id));
  const docIdsB = new Set(docsB.map((document) => document.id));
  const collectionIdsA = new Set(collectionsA.map((collection) => collection.id));
  const collectionIdsB = new Set(collectionsB.map((collection) => collection.id));
  assert.ok(docIdsA.has(accounts.A.document.id), "Account A sees its own document");
  assert.ok(docIdsB.has(accounts.B.document.id), "Account B sees its own document");
  assert.ok(!docIdsA.has(accounts.B.document.id), "Account A cannot list account B document");
  assert.ok(!docIdsB.has(accounts.A.document.id), "Account B cannot list account A document");
  assert.ok(collectionIdsA.has(accounts.A.collection.id), "Account A sees its own collection");
  assert.ok(collectionIdsB.has(accounts.B.collection.id), "Account B sees its own collection");
  assert.ok(!collectionIdsA.has(accounts.B.collection.id), "Account A cannot list account B collection");
  assert.ok(!collectionIdsB.has(accounts.A.collection.id), "Account B cannot list account A collection");
  console.log("PASS: document and collection lists contain no other-account test records");

  const getForeignDocument = await request("B", "GET", `/documents/${accounts.A.document.id}`);
  expectStatus(getForeignDocument, 404, "Read account A document as account B");

  const patchForeignDocument = await jsonRequest(
    "B",
    "PATCH",
    `/documents/${accounts.A.document.id}`,
    { category: "regulatory", collectionIds: [] },
  );
  expectStatus(patchForeignDocument, 404, "Edit account A document as account B");

  const reindexForeignDocument = await request(
    "B",
    "POST",
    `/documents/${accounts.A.document.id}/reindex`,
    { body: "{}" },
  );
  expectStatus(reindexForeignDocument, 404, "Re-index account A document as account B");

  const deleteForeignDocument = await request("B", "DELETE", `/documents/${accounts.A.document.id}`);
  expectStatus(deleteForeignDocument, 404, "Delete account A document as account B");

  const patchForeignCollection = await jsonRequest(
    "B",
    "PATCH",
    `/collections/${accounts.A.collection.id}`,
    { name: `Changed by B ${marker}`, description: "must not be saved" },
  );
  expectStatus(patchForeignCollection, 404, "Edit account A collection as account B");

  const deleteForeignCollection = await request(
    "B",
    "DELETE",
    `/collections/${accounts.A.collection.id}`,
  );
  expectStatus(deleteForeignCollection, 404, "Delete account A collection as account B");

  const crossTaggedUploadForm = new FormData();
  crossTaggedUploadForm.append("category", "general");
  crossTaggedUploadForm.append("collectionIds", accounts.A.collection.id);
  crossTaggedUploadForm.append(
    "file",
    new Blob([`Rejected cross-account collection assignment ${marker}`], { type: "text/plain" }),
    `rejected-${marker}.txt`,
  );
  const crossTaggedUpload = await request("B", "POST", "/documents", { body: crossTaggedUploadForm });
  expectStatus(crossTaggedUpload, 400, "Assign account A collection to account B upload");

  const [searchB, askB, docAAfter, collectionAAfter] = await Promise.all([
    jsonRequest("B", "POST", "/search", {
      query: `Ternary Kite protocol ${marker}`,
      collectionId: accounts.B.collection.id,
      limit: 12,
    }),
    jsonRequest("B", "POST", "/ask", {
      query: `According to the Ternary Kite protocol ${marker}, how many brass lanterns are stored?`,
      collectionId: accounts.B.collection.id,
    }),
    request("A", "GET", `/documents/${accounts.A.document.id}`),
    listCollections("A"),
  ]);
  expectStatus(searchB, 200, "Search account B library for account A's unique content");
  expectStatus(askB, 200, "Ask account B library about account A's unique content");
  expectStatus(docAAfter, 200, "Confirm account A document survives foreign mutations");
  const bVisibleDocIds = new Set((await listDocuments("B")).map((document) => document.id));
  assert.ok(
    (searchB.payload?.results ?? []).every((source) => bVisibleDocIds.has(source.documentId)),
    "Search results only reference documents listed for account B",
  );
  assert.ok(
    (askB.payload?.citations ?? []).every((source) => bVisibleDocIds.has(source.documentId)),
    "Grounded answer citations only reference documents listed for account B",
  );
  assert.equal(
    docAAfter.payload?.document?.category,
    "general",
    "Account A document metadata is unchanged by account B",
  );
  assert.ok(
    collectionAAfter.some((collection) => collection.id === accounts.A.collection.id
      && collection.name.startsWith("Isolation A ")),
    "Account A collection remains unchanged after account B edit and delete requests",
  );
  console.log("PASS: search and grounded Q&A expose only account B sources");
  console.log("PASS: cross-account document and collection mutations do not change account A records");
}

async function cleanup() {
  const errors = [];
  for (const account of ["A", "B"]) {
    const resources = accounts[account];
    if (resources.document?.id) {
      try {
        const result = await request(account, "DELETE", `/documents/${resources.document.id}`);
        if (![204, 404].includes(result.response.status)) {
          errors.push(`account ${account} document cleanup returned HTTP ${result.response.status}`);
        }
      } catch {
        errors.push(`account ${account} document cleanup could not reach the API`);
      }
    }
    if (resources.collection?.id) {
      try {
        const result = await request(account, "DELETE", `/collections/${resources.collection.id}`);
        if (![204, 404].includes(result.response.status)) {
          errors.push(`account ${account} collection cleanup returned HTTP ${result.response.status}`);
        }
      } catch {
        errors.push(`account ${account} collection cleanup could not reach the API`);
      }
    }
  }
  return errors;
}

let failed = false;
try {
  await verify();
  console.log("Knowledge Library account-isolation verification passed.");
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : "Knowledge Library verification failed.");
} finally {
  const cleanupErrors = await cleanup();
  if (cleanupErrors.length > 0) {
    failed = true;
    console.error(`Cleanup needs attention: ${cleanupErrors.join("; ")}`);
    for (const account of ["A", "B"]) {
      const resources = accounts[account];
      if (resources.document?.id || resources.collection?.id) {
        console.error(
          `Account ${account} temporary IDs: document=${resources.document?.id ?? "none"}, collection=${resources.collection?.id ?? "none"}`,
        );
      }
    }
  } else {
    console.log("Temporary documents and collections were removed.");
  }
}

if (failed) process.exitCode = 1;
