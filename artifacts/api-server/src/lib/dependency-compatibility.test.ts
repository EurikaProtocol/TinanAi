import assert from "node:assert/strict";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import express from "express";
import ExcelJS from "exceljs";
import { CreateTinanMarketplaceOrderBody, UpdateTinanMarketplaceOrderParams } from "@workspace/api-zod";

test("patched Express accepts compressed JSON and survives malformed trailing data", async () => {
  const app = express();
  app.use(express.json());
  app.post("/", (req, res) => { res.json(req.body); });
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: "Invalid request body" });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  try {
    const body = gzipSync('{"ok":true}');
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const malformed = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      body: Buffer.concat([body, Buffer.from("invalid trailer")]),
    });
    assert.ok([200, 400].includes(malformed.status));
    await malformed.arrayBuffer();
    // A decoder error must not escape the middleware and kill the process.
    await new Promise((resolve) => setImmediate(resolve));
    const after = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"alive":true}',
    });
    assert.deepEqual(await after.json(), { alive: true });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("ExcelJS round-trips conditional formatting through its CommonJS UUID consumer", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Compatibility");
  sheet.getCell("A1").value = 42;
  sheet.addConditionalFormatting({
    ref: "A1:A2",
    rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }] }],
  });
  const bytes = await book.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.equal(restored.getWorksheet("Compatibility")?.getCell("A1").value, 42);
});

test("regenerated Zod 4 API schemas preserve valid IDs and reject malformed requests", () => {
  assert.equal(UpdateTinanMarketplaceOrderParams.safeParse({ id: "b5bd03a4-15dc-43a2-81fd-1c1c9d13a935" }).success, true);
  assert.equal(UpdateTinanMarketplaceOrderParams.safeParse({ id: "not-an-id" }).success, false);
  assert.equal(CreateTinanMarketplaceOrderBody.safeParse({ request: "A valid marketplace request" }).success, true);
  assert.equal(CreateTinanMarketplaceOrderBody.safeParse({ request: "short" }).success, false);
});
