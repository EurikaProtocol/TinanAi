import assert from "node:assert/strict";
import test from "node:test";
import {
  AskKnowledgeBody,
  AssistTinanaiBody,
  CreateTinanaiBuilderProjectBody,
  GenerateTinanaiBuilderBody,
  UpdateKnowledgeDocumentBody,
  UpdateTinanPaymentAdminBody,
  UpdateTinanaiBuilderProjectBody,
  UploadKnowledgeDocumentBody,
} from "../../../../lib/api-zod/src/generated/api.ts";

type ArraySchema = {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { issues: Array<{ code: string }> } };
};

function expectOversizeArrayRejected(schema: ArraySchema, value: unknown, name: string) {
  const result = schema.safeParse(value);
  if (result.success) assert.fail(`${name} accepted an array above its documented limit.`);
  assert.ok(
    result.error.issues.some((issue) => issue.code === "too_big"),
    `${name} should fail with a maximum-size validation issue.`,
  );
}

function repeated<T>(count: number, item: T): T[] {
  return Array.from({ length: count }, () => item);
}

test("API request collection limits reject oversized untrusted arrays", () => {
  expectOversizeArrayRejected(
    AssistTinanaiBody.shape.history,
    repeated(13, { role: "user", content: "test" }),
    "assistant history (max 12)",
  );
  expectOversizeArrayRejected(
    GenerateTinanaiBuilderBody.shape.files,
    repeated(21, "upload.txt"),
    "builder uploads (max 20)",
  );
  expectOversizeArrayRejected(
    CreateTinanaiBuilderProjectBody.shape.files,
    repeated(21, {}),
    "new project files (max 20)",
  );
  expectOversizeArrayRejected(
    UpdateTinanaiBuilderProjectBody.shape.files,
    repeated(21, {}),
    "updated project files (max 20)",
  );
  expectOversizeArrayRejected(
    UpdateTinanPaymentAdminBody.shape.services,
    repeated(7, {}),
    "payment services (max 6)",
  );
  expectOversizeArrayRejected(
    UploadKnowledgeDocumentBody.shape.collectionIds,
    repeated(13, "00000000-0000-4000-8000-000000000000"),
    "document collection IDs (max 12)",
  );
  expectOversizeArrayRejected(
    UpdateKnowledgeDocumentBody.shape.collectionIds,
    repeated(13, "00000000-0000-4000-8000-000000000000"),
    "updated collection IDs (max 12)",
  );
  expectOversizeArrayRejected(
    AskKnowledgeBody.shape.history,
    repeated(7, { role: "user", content: "test" }),
    "knowledge history (max 6)",
  );
});
