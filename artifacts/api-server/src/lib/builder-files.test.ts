import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { BuilderFileError, inspectBuilderFiles, redactBuilderText, sanitizeFileName } from "./builder-files.ts";

function uploadedFile(name: string, content: string): {
  originalname: string;
  size: number;
  buffer: Buffer;
} {
  const buffer = Buffer.from(content, "utf8");
  return { originalname: name, size: buffer.byteLength, buffer };
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipBuffer(entries: Array<[string, string]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const content = Buffer.from(text, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe("TINANAI Builder file inspection", () => {
  it("calculates real CSV metrics, removes duplicate rows, escapes formulas and redacts secrets", async () => {
    const csv = [
      "category,amount,formula,api_key",
      "A,10,=1+1,api_key=sk-live-abcdefghijklmnopqrstuvwxyz123456",
      "B,30,=2+2,password=SuperSecretValue123",
      "B,30,=2+2,password=SuperSecretValue123",
      "C,,=3+3,none",
    ].join("\n");
    const result = await inspectBuilderFiles([uploadedFile("sales.csv", csv)]);
    const dataset = result.datasets[0];
    const cleaned = result.cleanCsvExports[0]?.content ?? "";

    assert.ok(dataset);
    assert.equal(dataset.rowCount, 4);
    assert.equal(dataset.duplicateRows, 1);
    assert.ok(Math.abs((dataset.columns.find((column) => column.name === "amount")?.mean ?? 0) - 70 / 3) < 1e-12);
    assert.deepEqual(dataset.chart?.points, [
      { label: "A", value: 10 },
      { label: "B", value: 30 },
    ]);
    assert.match(cleaned, /A,10,'=1\+1,api_key=\[REDACTED\]/);
    assert.match(cleaned, /B,30,'=2\+2,password=\[REDACTED\]/);
    assert.doesNotMatch(cleaned, /sk-live|SuperSecretValue123/);
    assert.ok(result.uploads[0]?.warning?.includes("redacted"));
    assert.doesNotMatch(result.context, /sk-live|SuperSecretValue123/);
    assert.match(cleaned, /C,,/);
  });

  it("rejects traversal-sensitive filenames and malformed ZIP uploads", async () => {
    await assert.rejects(
      inspectBuilderFiles([uploadedFile("../secret.txt", "not a secret")]),
      (error: unknown) => error instanceof BuilderFileError && error.statusCode === 400,
    );
    await assert.rejects(
      inspectBuilderFiles([uploadedFile("project.zip", "this is not a zip")]),
      (error: unknown) => error instanceof BuilderFileError && /ZIP file signature/.test(error.message),
    );
  });

  it("inspects ZIP contents as data and rejects traversal paths", async () => {
    const project = zipBuffer([["src/records.csv", "kind,qty\nalpha,2\nbeta,3\n"]]);
    const processed = await inspectBuilderFiles([{
      originalname: "project.zip",
      size: project.byteLength,
      buffer: project,
    }]);
    assert.equal(processed.datasets[0]?.sourceName, "project.zip › src/records.csv");
    assert.equal(processed.datasets[0]?.rowCount, 2);
    assert.ok(processed.uploads[0]?.warning?.includes("scripts were not run"));

    const traversal = zipBuffer([["../escape.csv", "kind,qty\nalpha,2"]]);
    await assert.rejects(
      inspectBuilderFiles([{
        originalname: "unsafe.zip",
        size: traversal.byteLength,
        buffer: traversal,
      }]),
      (error: unknown) => error instanceof BuilderFileError && /unsafe file path/.test(error.message),
    );
  });

  it("redacts credential-like prompt and filename values", () => {
    const safePrompt = redactBuilderText('Please use password="SuperSecretValue123" only as an example.');
    const safeName = sanitizeFileName("sk-live-abcdefghijklmnopqrstuvwxyz123456.csv");
    assert.equal(safePrompt.changed, true);
    assert.doesNotMatch(safePrompt.text, /SuperSecretValue123/);
    assert.equal(safeName, "[REDACTED_API_KEY].csv");
  });

  it("rejects binary data disguised as a supported text file", async () => {
    const buffer = Buffer.from([0x61, 0x00, 0x62]);
    await assert.rejects(
      inspectBuilderFiles([{ originalname: "notes.md", size: buffer.byteLength, buffer }]),
      (error: unknown) => error instanceof BuilderFileError && /binary data/.test(error.message),
    );
  });

  it("reads bounded XLSX worksheets without running workbook formulas", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Quarterly sales");
    sheet.addRow(["region", "revenue", "formula"]);
    sheet.addRow(["East", 24, { formula: "12+12", result: 24 }]);
    sheet.addRow(["West", 48, { formula: "24+24", result: 48 }]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await inspectBuilderFiles([{
      originalname: "quarterly.xlsx",
      size: buffer.byteLength,
      buffer,
    }]);
    const dataset = result.datasets[0];

    assert.equal(dataset?.sheetName, "Quarterly sales");
    assert.equal(dataset?.rowCount, 2);
    assert.equal(dataset?.columns.find((column) => column.name === "revenue")?.mean, 36);
    assert.equal(dataset?.previewRows[0]?.formula, 24);
  });
});
