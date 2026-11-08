import { spawn } from "node:child_process";
import path from "node:path";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import yauzl from "yauzl";
import type {
  TinanaiAnalyticsDataset,
  TinanaiBuilderUpload,
} from "@workspace/api-zod";

export const MAX_UPLOAD_FILE_BYTES = configuredLimit(
  "TINANAI_MAX_UPLOAD_FILE_BYTES",
  20 * 1024 * 1024,
  20 * 1024 * 1024,
);
export const MAX_UPLOAD_REQUEST_BYTES = configuredLimit(
  "TINANAI_MAX_UPLOAD_REQUEST_BYTES",
  50 * 1024 * 1024,
  50 * 1024 * 1024,
);
export const MAX_UPLOAD_FILES = 20;

const MAX_ARCHIVE_FILES = 500;
const MAX_ARCHIVE_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_EXPANSION_RATIO = 200;
const MAX_ARCHIVE_DEPTH = 8;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 50;
const MAX_SHEETS = 5;
const MAX_EXTRACTED_TEXT_CHARS = 100_000;
const MAX_AI_CONTEXT_CHARS = 20_000;
const MAX_PDF_OUTPUT_BYTES = 2 * 1024 * 1024;
const CSV_MISSING_VALUES = new Set(["", "null", "n/a", "na", "nan"]);
const BINARY_EXTENSIONS = new Set([".pdf", ".xlsx", ".zip"]);
const SOURCE_EXTENSIONS = new Set([
  ".txt", ".md", ".mdx", ".sol", ".js", ".jsx", ".ts", ".tsx", ".mjs",
  ".cjs", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".cs", ".php",
  ".rb", ".sh", ".sql", ".html", ".htm", ".css", ".scss", ".json", ".yaml",
  ".yml", ".toml", ".xml", ".vue", ".svelte", ".env.example", ".properties",
]);
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ...BINARY_EXTENSIONS,
  ".csv",
  ...SOURCE_EXTENSIONS,
]);

type Cell = string | number | boolean | null;

interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}

interface DatasetWork {
  report: TinanaiAnalyticsDataset;
  cleanCsv: string;
  context: string;
  redacted: boolean;
}

interface InspectedFile {
  upload: TinanaiBuilderUpload;
  context: string;
  dataset?: DatasetWork;
}

export interface InspectedBuilderFiles {
  uploads: TinanaiBuilderUpload[];
  datasets: TinanaiAnalyticsDataset[];
  cleanCsvExports: Array<{ name: string; content: string }>;
  warnings: string[];
  context: string;
}

export class BuilderFileError extends Error {
  readonly statusCode: 400 | 413;

  constructor(
    message: string,
    statusCode: 400 | 413 = 400,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.name = "BuilderFileError";
  }
}

function configuredLimit(name: string, fallback: number, ceiling: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
    throw new Error(`${name} must be an integer between 1 and ${ceiling}.`);
  }
  return value;
}

function secretPath(name: string): boolean {
  return name.split("/").some((part) =>
    /^\.env(?:\.|$)/i.test(part)
    || /^(?:credentials?|secrets?)(?:[._-]|$)/i.test(part)
    || /(?:^|[._-])(?:private[-_]?key|wallet[-_]?seed)(?:[._-]|$)/i.test(part),
  );
}

function redactArchivePath(name: string): string {
  const parts = name.split("/");
  return parts.map((part, index) => redactFileName(part, index === parts.length - 1)).join("/");
}

function redactFileName(name: string, preserveExtension: boolean): string {
  const extension = preserveExtension ? fileExtension(name) : "";
  const stem = extension ? name.slice(0, -extension.length) : name;
  return `${redactSensitiveText(stem).text}${extension}`;
}

export function sanitizeFileName(name: string): string {
  if (
    !name
    || name.length > 240
    || /[\u0000-\u001f\u007f/\\]/.test(name)
    || name === "."
    || name === ".."
    || secretPath(name)
  ) {
    throw new BuilderFileError("The filename is not supported. Rename the file and try again.");
  }
  return redactFileName(name, true);
}

function fileExtension(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".env.example")) return ".env.example";
  return path.posix.extname(lowerName);
}

function isZipSignature(data: Buffer): boolean {
  return data.length >= 4
    && data[0] === 0x50
    && data[1] === 0x4b
    && ([0x03, 0x05, 0x07].includes(data[2] ?? -1))
    && ([0x04, 0x06, 0x08].includes(data[3] ?? -1));
}

function redactSensitiveText(text: string): { text: string; changed: boolean } {
  const redact = (value: string) =>
    value
      .replace(
        /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi,
        "$1\n[REDACTED]\n$2",
      )
      .replace(
        /("(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd|private[_-]?key|secret)"\s*:\s*")([^"]{8,})(")/gi,
        "$1[REDACTED]$3",
      )
      .replace(
        /((?:API[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|MNEMONIC|SEED[_-]?PHRASE|RECOVERY[_-]?PHRASE|SECRET)\s*=\s*)(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"'#]{8,})/gi,
        "$1[REDACTED]",
      )
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{24,}\b/g, "[REDACTED_API_KEY]")
      .replace(/\b0x[0-9a-f]{64}\b/gi, "[REDACTED_PRIVATE_KEY]");
  const safeText = redact(text);
  return { text: safeText, changed: safeText !== text };
}

export function redactBuilderText(text: string): { text: string; changed: boolean } {
  return redactSensitiveText(text);
}

function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim();
  if (CSV_MISSING_VALUES.has(text.toLowerCase())) return null;
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    const number = Number(text);
    if (Number.isFinite(number)) return number;
  }
  return text;
}

function detectColumnType(values: Cell[]): "number" | "boolean" | "date" | "string" {
  const observed = values.filter((value): value is Exclude<Cell, null> => value !== null);
  if (observed.length === 0) return "string";
  if (observed.every((value) => typeof value === "number")) return "number";
  if (observed.every((value) => typeof value === "boolean")) return "boolean";
  if (
    observed.every(
      (value) =>
        typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+\-Zz]+)?$/.test(value)
        && Number.isFinite(Date.parse(value)),
    )
  ) {
    return "date";
  }
  return "string";
}

function csvValue(value: Cell): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  if (/[,"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildDataset(
  sourceName: string,
  sheetName: string | null,
  matrix: unknown[][],
  wasTruncated: boolean,
): DatasetWork {
  if (matrix.length === 0) {
    throw new BuilderFileError(`${sourceName} does not contain a header row and tabular data.`);
  }
  const header = matrix[0] ?? [];
  const width = Math.min(header.length, MAX_COLUMNS);
  if (header.length > MAX_COLUMNS) {
    throw new BuilderFileError(`${sourceName} has more than ${MAX_COLUMNS} columns; reduce the file and retry.`);
  }
  if (width === 0) {
    throw new BuilderFileError(`${sourceName} does not contain any columns.`);
  }

  let redacted = false;
  const headerCounts = new Map<string, number>();
  const names = Array.from({ length: width }, (_, index) => {
    const rawName = String(header[index] ?? "").trim();
    const safeName = redactSensitiveText(rawName);
    redacted ||= safeName.changed;
    const originalName = safeName.text;
    const base = (originalName || `Column ${index + 1}`).slice(0, 120);
    const count = (headerCounts.get(base) ?? 0) + 1;
    headerCounts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const values: Cell[][] = [];
  const seenRows = new Set<string>();
  let duplicateRows = 0;
  let truncated = wasTruncated;
  for (const rawRow of matrix.slice(1)) {
    if (values.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const row = Array.from({ length: width }, (_, index) => {
      const value = normalizeCell(rawRow[index]);
      if (typeof value !== "string") return value;
      const safe = redactSensitiveText(value);
      redacted ||= safe.changed;
      return safe.text;
    });
    if (row.every((value) => value === null)) continue;
    const key = JSON.stringify(row);
    if (seenRows.has(key)) duplicateRows += 1;
    else seenRows.add(key);
    values.push(row);
  }
  if (matrix.length > MAX_ROWS + 1) truncated = true;

  const columns = names.map((name, index) => {
    const cells = values.map((row) => row[index] ?? null);
    const type = detectColumnType(cells);
    const numeric = cells.filter((value): value is number => typeof value === "number");
    const mean = numeric.length
      ? numeric.reduce((sum, value) => sum + value / numeric.length, 0)
      : null;
    return {
      name,
      type,
      missing: cells.filter((value) => value === null).length,
      min: numeric.length ? Math.min(...numeric) : null,
      max: numeric.length ? Math.max(...numeric) : null,
      mean,
    };
  });
  const previewRows = values.slice(0, 12).map((row) =>
    Object.fromEntries(
      names.map((name, index) => {
        const value = row[index] ?? null;
        return [name, typeof value === "string" ? value.slice(0, 200) : value];
      }),
    ),
  );

  const categoricalIndex = columns.findIndex((column) => column.type === "string");
  const numericIndex = columns.findIndex((column) => column.type === "number");
  let chart: TinanaiAnalyticsDataset["chart"] = null;
  if (categoricalIndex >= 0) {
    const groups = new Map<string, { values: number[]; count: number }>();
    for (const row of values) {
      const label = row[categoricalIndex];
      if (label === null || label === undefined) continue;
      const key = String(label);
      const group = groups.get(key) ?? { values: [], count: 0 };
      if (numericIndex >= 0 && typeof row[numericIndex] === "number") {
        group.values.push(row[numericIndex] as number);
        group.count += 1;
      }
      groups.set(key, group);
    }
    const allPoints = [...groups.entries()];
    const points = allPoints.slice(0, 20).flatMap(([label, group]) => {
      if (numericIndex >= 0 && group.count === 0) return [];
      const average = numericIndex >= 0
        ? group.values.reduce((sum, value) => sum + value / group.values.length, 0)
        : group.count;
      return Number.isFinite(average) ? [{ label: label.slice(0, 80), value: average }] : [];
    });
    if (points.length) {
      const category = columns[categoricalIndex]?.name ?? "Category";
      const metric = columns[numericIndex]?.name ?? "Rows";
      chart = {
        title: numericIndex >= 0 ? `Average ${metric} by ${category}` : `Rows by ${category}`,
        categoryColumn: category,
        valueColumn: metric,
        aggregation: numericIndex >= 0 ? "mean" : "count",
        points,
        sampled: allPoints.length > points.length || truncated,
      };
    }
  } else if (numericIndex >= 0) {
    const points = values
      .slice(0, 20)
      .flatMap((row, index) => {
        const value = row[numericIndex];
        return typeof value === "number" ? [{ label: `Row ${index + 1}`, value }] : [];
      });
    if (points.length) {
      chart = {
        title: `${columns[numericIndex]?.name ?? "Value"} by row`,
        categoryColumn: "Row",
        valueColumn: columns[numericIndex]?.name ?? "Value",
        aggregation: "value",
        points,
        sampled: values.length > points.length || truncated,
      };
    }
  }

  const cleanRows = values.filter((row) => {
    const key = JSON.stringify(row);
    if (!seenRows.has(key)) return false;
    seenRows.delete(key);
    return true;
  });
  const cleanCsv = [
    names.map((name) => csvValue(name)).join(","),
    ...cleanRows.map((row) => row.map(csvValue).join(",")),
  ].join("\r\n") + "\r\n";
  const report: TinanaiAnalyticsDataset = {
    sourceName,
    sheetName,
    rowCount: values.length,
    columnCount: names.length,
    duplicateRows,
    truncated,
    columns,
    previewRows,
    chart,
    cleanCsvUrl: null,
    cleanCsvBytes: null,
  };
  const context = [
    `Dataset ${JSON.stringify(sourceName)}${sheetName ? `, sheet ${JSON.stringify(sheetName)}` : ""}`,
    `Rows analyzed: ${report.rowCount}; columns: ${report.columnCount}; duplicate rows: ${duplicateRows}; sample truncated: ${truncated}.`,
    `Columns: ${columns.map((column) => `${column.name} (${column.type}, ${column.missing} missing${column.mean === null ? "" : `, mean ${column.mean}`})`).join("; ")}`,
    `Preview: ${JSON.stringify(previewRows.slice(0, 6))}`,
  ].join("\n");
  return { report, cleanCsv, context, redacted };
}

function parseCsv(name: string, text: string): DatasetWork {
  const result = Papa.parse<string[]>(text, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
    preview: MAX_ROWS + 2,
    worker: false,
  });
  if (result.errors.some((error) => error.code === "MissingQuotes" || error.code === "InvalidQuotes")) {
    throw new BuilderFileError(`${name} contains malformed quoted CSV data.`);
  }
  if (result.errors.some((error) => error.code === "TooManyFields")) {
    throw new BuilderFileError(`${name} contains rows with too many fields.`);
  }
  const data = result.data;
  const truncated = Boolean(result.meta.cursor && result.meta.cursor < text.length);
  return buildDataset(name, null, data, truncated);
}

function jsonRows(value: unknown): unknown[][] | null {
  let rows: unknown;
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    rows = Array.isArray(object.data) ? object.data : Array.isArray(object.rows) ? object.rows : null;
    if (!rows) {
      const entries = Object.entries(object);
      return [["Field", "Value"], ...entries.map(([key, cell]) => [key, cell])];
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  if (Array.isArray(first)) return rows as unknown[][];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const keys = Object.keys(first as Record<string, unknown>).slice(0, MAX_COLUMNS);
    return [keys, ...rows.map((row) => keys.map((key) => (row as Record<string, unknown>)?.[key]))];
  }
  return [["Value"], ...rows.map((row) => [row])];
}

function parseJsonDataset(name: string, value: unknown): DatasetWork | null {
  const rows = jsonRows(value);
  return rows ? buildDataset(name, null, rows, rows.length > MAX_ROWS + 1) : null;
}

function parseArchive(
  buffer: Buffer,
  extraAllowedExtensions: ReadonlySet<string> = new Set(),
): Promise<Array<{ name: string; buffer: Buffer }>> {
  return new Promise((resolve, reject) => {
    const files: Array<{ name: string; buffer: Buffer }> = [];
    let archiveFileCount = 0;
    let expandedBytes = 0;
    let completed = false;
    yauzl.fromBuffer(
      buffer,
      {
        lazyEntries: true,
        autoClose: true,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (openError, zip) => {
        if (openError || !zip) {
          reject(new BuilderFileError("The ZIP archive is invalid or could not be opened."));
          return;
        }
        const fail = (message: string, statusCode: 400 | 413 = 400) => {
          if (completed) return;
          completed = true;
          zip.close();
          reject(new BuilderFileError(message, statusCode));
        };
        zip.on("error", (error: Error) => {
          const unsafePath = /^invalid relative path:/i.test(error.message);
          fail(
            unsafePath
              ? "The ZIP archive contains an unsafe file path."
              : "The ZIP archive could not be safely inspected.",
          );
        });
        if (zip.entryCount > MAX_ARCHIVE_FILES) {
          fail(`A ZIP archive may contain at most ${MAX_ARCHIVE_FILES} entries.`, 413);
          return;
        }
        zip.on("entry", (entry) => {
          if (completed) return;
          try {
            const entryName = String(entry.fileName);
            if (
              !entryName
              || entryName.length > 240
              || entryName.startsWith("/")
              || entryName.includes("\\")
              || entryName.includes("\0")
              || /^[a-z]:/i.test(entryName)
              || entryName.split("/").some((part) => part === ".." || part === "." || part === "__proto__" || part === "constructor" || part === "prototype")
            ) {
              fail("The ZIP archive contains an unsafe file path.");
              return;
            }
            const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
            if (mode === 0o120000 || (entry.generalPurposeBitFlag & 1) !== 0) {
              fail("The ZIP archive contains a symlink or encrypted entry.");
              return;
            }
            const directory = entry.fileName.endsWith("/");
            if (!directory) archiveFileCount += 1;
            if (archiveFileCount > MAX_ARCHIVE_FILES) {
              fail(`A ZIP archive may contain at most ${MAX_ARCHIVE_FILES} files.`, 413);
              return;
            }
            if (entry.uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
              fail("A ZIP entry exceeds the 20 MB expanded-file limit.", 413);
              return;
            }
            expandedBytes += entry.uncompressedSize;
            if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
              fail("The ZIP archive exceeds the 50 MB expanded-size limit.", 413);
              return;
            }
            if (
              entry.uncompressedSize > 1024
              && (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > MAX_ARCHIVE_EXPANSION_RATIO)
            ) {
              fail("The ZIP archive has an unsafe compression ratio.");
              return;
            }
            const safePath = path.posix.normalize(entryName);
            const parts = safePath.split("/");
            if (parts.length > MAX_ARCHIVE_DEPTH + 1) {
              fail(`ZIP paths may be nested no more than ${MAX_ARCHIVE_DEPTH} folders deep.`, 413);
              return;
            }
            if (directory || secretPath(safePath)) {
              zip.readEntry();
              return;
            }
            if (fileExtension(safePath) === ".zip") {
              fail("Nested ZIP archives are not processed. Upload one ZIP level at a time.");
              return;
            }
            const ignoredDirectory = /(?:^|\/)(?:node_modules|\.git|\.venv|venv|vendor|dist|build|target)(?:\/|$)/i.test(safePath);
            const extension = fileExtension(safePath);
            if (ignoredDirectory || (!ALLOWED_UPLOAD_EXTENSIONS.has(extension) && !extraAllowedExtensions.has(extension))) {
              zip.readEntry();
              return;
            }
            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                fail("A ZIP entry could not be safely read.");
                return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              stream.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_ARCHIVE_ENTRY_BYTES || size > entry.uncompressedSize) {
                  stream.destroy();
                  fail("A ZIP entry exceeded its declared size.", 413);
                  return;
                }
                chunks.push(chunk);
              });
              stream.on("error", () => fail("A ZIP entry could not be safely read."));
              stream.on("end", () => {
                if (completed) return;
                if (size !== entry.uncompressedSize) {
                  fail("A ZIP entry's contents do not match its declared size.");
                  return;
                }
                files.push({ name: redactArchivePath(safePath), buffer: Buffer.concat(chunks, size) });
                zip.readEntry();
              });
            });
          } catch {
            fail("The ZIP archive could not be safely inspected.");
          }
        });
        zip.on("end", () => {
          if (completed) return;
          completed = true;
          resolve(files);
        });
        zip.readEntry();
      },
    );
  });
}

export function readSafeArchiveEntries(
  buffer: Buffer,
  allowDocx = false,
): Promise<Array<{ name: string; buffer: Buffer }>> {
  return parseArchive(buffer, allowDocx ? new Set([".docx"]) : new Set());
}

function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn("pdftotext", ["-enc", "UTF-8", "-nopgbrk", "-", "-"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.kill("SIGKILL");
      reject(new BuilderFileError(message));
    };
    const timer = setTimeout(() => fail("PDF text extraction timed out. Try a smaller or simpler PDF."), 10_000);
    timer.unref();
    process.on("error", () => fail("PDF text extraction is unavailable on this server."));
    process.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PDF_OUTPUT_BYTES) {
        fail("Extracted PDF text exceeds the 2 MB processing limit.");
        return;
      }
      chunks.push(chunk);
    });
    process.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const text = Buffer.concat(chunks, outputBytes).toString("utf8");
      if (code !== 0 || !text.trim()) {
        reject(new BuilderFileError("The PDF is unreadable, password-protected, or contains no extractable text."));
      } else {
        resolve(text);
      }
    });
    process.stdin.on("error", () => undefined);
    process.stdin.end(buffer);
  });
}

function safeTextFromBuffer(buffer: Buffer, name: string): string {
  if (buffer.includes(0)) {
    throw new BuilderFileError(`${name} is binary data, not a supported text or source file.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    throw new BuilderFileError(`${name} is not valid UTF-8 text.`);
  }
}

function workbookValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if ("result" in value) return value.result ?? null;
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return null;
}

async function parseWorkbook(name: string, buffer: Buffer): Promise<DatasetWork[]> {
  const entries = await parseArchive(buffer);
  if (!entries.some((entry) => entry.name.toLowerCase() === "xl/workbook.xml")) {
    throw new BuilderFileError(`${name} is a ZIP file, but not a valid XLSX workbook.`);
  }
  const workbook = new ExcelJS.Workbook();
  try {
    const workbookBuffer = Buffer.from(buffer);
    await workbook.xlsx.load(
      workbookBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new BuilderFileError(`${name} could not be read as a valid XLSX workbook.`);
  }
  if (workbook.worksheets.length === 0) {
    throw new BuilderFileError(`${name} does not contain any readable worksheets.`);
  }
  const datasets: DatasetWork[] = [];
  for (const sheet of workbook.worksheets.slice(0, MAX_SHEETS)) {
    const matrix: unknown[][] = [];
    let overflowColumns = false;
      const maxRowNumber = Math.min(sheet.rowCount, MAX_ROWS + 1);
      for (let rowNumber = 1; rowNumber <= maxRowNumber; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (!row.hasValues) continue;
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (columnNumber > MAX_COLUMNS) {
          overflowColumns = true;
          return;
        }
        values[columnNumber - 1] = workbookValue(cell.value);
      });
        matrix[rowNumber - 1] = values;
      }
    if (overflowColumns) {
      throw new BuilderFileError(`${name} contains a worksheet with more than ${MAX_COLUMNS} columns.`);
    }
    const matrixRows = matrix.filter((row) => Array.isArray(row));
      const sheetWasTruncated = sheet.rowCount > MAX_ROWS + 1 || sheet.actualRowCount > matrixRows.length;
    if (matrixRows.length > 0) {
      datasets.push(buildDataset(name, sheet.name.slice(0, 80), matrixRows, sheetWasTruncated));
    }
  }
  if (workbook.worksheets.length > MAX_SHEETS && datasets.length) {
    const final = datasets[datasets.length - 1];
    if (final) final.report.truncated = true;
  }
  return datasets;
}

async function inspectOneFile(
  name: string,
  size: number,
  buffer: Buffer,
  archive?: { zipName: string },
): Promise<InspectedFile[]> {
  const extension = fileExtension(name);
  const displayName = archive ? `${archive.zipName} › ${name}` : name;
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new BuilderFileError(`${name} has an unsupported file format.`);
  }
  if (extension === ".pdf") {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new BuilderFileError(`${name} does not have a valid PDF file signature.`);
    }
    const extracted = await extractPdfText(buffer);
    const safe = redactSensitiveText(extracted);
    const excerpt = safe.text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
    const truncated = excerpt.length < safe.text.length;
    const warning = safe.changed ? "Secret-like values were redacted before AI processing." : null;
    return [{
      upload: {
        name: displayName,
        size,
        format: "PDF",
        extractedCharacters: excerpt.length,
        truncated,
        warning,
      },
      context: `PDF ${JSON.stringify(displayName)}${truncated ? " (text excerpt truncated)" : ""}:\n${excerpt}`,
    }];
  }

  if (extension === ".zip") {
    if (!isZipSignature(buffer)) {
      throw new BuilderFileError(`${name} does not have a valid ZIP file signature.`);
    }
    const entries = await parseArchive(buffer);
    if (entries.length === 0) {
      throw new BuilderFileError(`${name} contains no supported, non-secret files to inspect.`);
    }
    const inspected: InspectedFile[] = [{
      upload: {
        name,
        size,
        format: "ZIP",
        extractedCharacters: 0,
        truncated: false,
        warning: `Inspected ${entries.length} supported files in memory; uploaded scripts were not run.`,
      },
      context: `ZIP project ${JSON.stringify(name)} contains ${entries.length} supported files. File list: ${entries.slice(0, 200).map((entry) => entry.name).join(", ")}${entries.length > 200 ? " (list truncated)" : ""}.`,
    }];
    for (const entry of entries) {
      inspected.push(...await inspectOneFile(entry.name, entry.buffer.length, entry.buffer, { zipName: name }));
    }
    return inspected;
  }

  if (extension === ".xlsx") {
    if (!isZipSignature(buffer)) {
      throw new BuilderFileError(`${name} does not have a valid XLSX file signature.`);
    }
    const sheets = await parseWorkbook(name, buffer);
    if (sheets.length === 0) {
      throw new BuilderFileError(`${name} has no non-empty worksheets to analyze.`);
    }
    return sheets.map((dataset) => ({
      upload: {
        name: displayName,
        size,
        format: "XLSX",
        extractedCharacters: dataset.context.length,
        truncated: dataset.report.truncated,
        warning: dataset.redacted ? "Secret-like values were redacted before AI processing." : null,
      },
      context: dataset.context,
      dataset,
    }));
  }

  if (extension === ".csv") {
    const raw = safeTextFromBuffer(buffer, name);
    const dataset = parseCsv(displayName, raw);
    return [{
      upload: {
        name: displayName,
        size,
        format: "CSV",
        extractedCharacters: dataset.context.length,
        truncated: dataset.report.truncated,
        warning: dataset.redacted ? "Secret-like values were redacted before AI processing." : null,
      },
      context: dataset.context,
      dataset,
    }];
  }

  if (extension === ".json") {
    const raw = safeTextFromBuffer(buffer, name);
    const redacted = redactSensitiveText(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(redacted.text);
    } catch {
      throw new BuilderFileError(`${name} contains malformed JSON.`);
    }
    const dataset = parseJsonDataset(displayName, parsed);
    const fileText = dataset
      ? dataset.context
      : `JSON file ${JSON.stringify(displayName)}:\n${redacted.text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}`;
    const excerpt = fileText.slice(0, MAX_EXTRACTED_TEXT_CHARS);
    const truncated = excerpt.length < fileText.length;
    const warning = (redacted.changed || dataset?.redacted)
      ? "Secret-like values were redacted before AI processing."
      : null;
    return [{
      upload: {
        name: displayName,
        size,
        format: "JSON",
        extractedCharacters: excerpt.length,
        truncated,
        warning,
      },
      context: excerpt,
      ...(dataset ? { dataset } : {}),
    }];
  }

  const raw = safeTextFromBuffer(buffer, name);
  const redacted = redactSensitiveText(raw);
  const excerpt = redacted.text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
  const truncated = excerpt.length < redacted.text.length;
  return [{
    upload: {
      name: displayName,
      size,
      format: extension.slice(1).toUpperCase(),
      extractedCharacters: excerpt.length,
      truncated,
      warning: redacted.changed ? "Secret-like values were redacted before AI processing." : null,
    },
    context: `Text/source file ${JSON.stringify(displayName)}${truncated ? " (excerpt truncated)" : ""}:\n${excerpt}`,
  }];
}

export async function inspectBuilderFiles(
  files: UploadedFileLike[],
): Promise<InspectedBuilderFiles> {
  const inspected: InspectedFile[] = [];
  let archiveEntryCount = 0;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_FILE_BYTES || file.buffer.length > MAX_UPLOAD_FILE_BYTES) {
      throw new BuilderFileError("Each uploaded file must be 20 MB or smaller.", 413);
    }
    const name = sanitizeFileName(file.originalname);
    const result = await inspectOneFile(name, file.size, file.buffer);
    archiveEntryCount += Math.max(0, result.length - 1);
    if (archiveEntryCount > MAX_ARCHIVE_FILES) {
      throw new BuilderFileError(`A request may contain at most ${MAX_ARCHIVE_FILES} files from ZIP archives.`, 413);
    }
    inspected.push(...result);
  }

  const datasets = inspected.flatMap((file) => file.dataset ? [file.dataset.report] : []);
  const cleanCsvExports = inspected.flatMap((file) =>
    file.dataset
      ? [{ name: `${path.posix.basename(file.dataset.report.sourceName).replace(/\.[^.]+$/, "")}${file.dataset.report.sheetName ? `-${file.dataset.report.sheetName}` : ""}-cleaned.csv`, content: file.dataset.cleanCsv }]
      : [],
  );
  const warnings = inspected.flatMap((file) => file.upload.warning ? [file.upload.warning] : []);
  const context = inspected.map((file) => file.context).join("\n\n").slice(0, MAX_AI_CONTEXT_CHARS);
  if (inspected.some((file) => file.context.length > MAX_AI_CONTEXT_CHARS)) {
    warnings.push("Only the first 20,000 characters of combined file context were sent to the AI provider.");
  }

  return {
    uploads: inspected.map((file) => file.upload),
    datasets,
    cleanCsvExports,
    warnings: [...new Set(warnings)],
    context,
  };
}
