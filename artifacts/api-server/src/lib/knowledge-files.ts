import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { redactBuilderText, readSafeArchiveEntries } from "./builder-files.ts";

const MAX_EXTRACTED_CHARS = 4 * 1024 * 1024;
const MAX_PDF_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_OCR_PAGES = 100;
const CHUNK_CHAR_LIMIT = 3_600;
const CHUNK_OVERLAP = 420;

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".mdx", ".json", ".csv", ".sol", ".js", ".jsx", ".ts", ".tsx",
  ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".cs",
  ".php", ".rb", ".sh", ".sql", ".html", ".htm", ".css", ".scss", ".yaml",
  ".yml", ".toml", ".xml", ".vue", ".svelte", ".properties",
]);

export interface KnowledgeSegment {
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
}

export interface KnowledgeChunkInput extends KnowledgeSegment {
  chunkIndex: number;
}

export interface ExtractedKnowledgeDocument {
  segments: KnowledgeSegment[];
  pageCount: number | null;
  warning: string | null;
  redacted: boolean;
}

export type KnowledgeFileFormat = "pdf" | "docx" | "txt" | "md" | "json" | "csv" | "code" | "zip";

export function getKnowledgeFileFormat(filename: string): KnowledgeFileFormat | null {
  const extension = path.extname(filename.toLowerCase());
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  if (extension === ".txt") return "txt";
  if (extension === ".md" || extension === ".mdx") return "md";
  if (extension === ".json") return "json";
  if (extension === ".csv") return "csv";
  if (extension === ".zip") return "zip";
  if (TEXT_EXTENSIONS.has(extension)) return "code";
  return null;
}

function runCommand(
  command: string,
  args: string[],
  input: Buffer | undefined,
  timeoutMs: number,
  outputLimit: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result ?? Buffer.alloc(0));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${command} timed out while processing the document.`));
    }, timeoutMs);
    timer.unref();
    child.on("error", () => finish(new Error(`${command} is unavailable on this server.`)));
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > outputLimit) {
        child.kill("SIGKILL");
        finish(new Error("Extracted document text exceeds the processing limit."));
        return;
      }
      chunks.push(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`${command} could not read this document.`));
        return;
      }
      finish(undefined, Buffer.concat(chunks, outputBytes));
    });
    child.stdin.on("error", () => undefined);
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function getPdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const output = await runCommand("pdfinfo", ["-"], buffer, 10_000, 32 * 1024);
    const match = output.toString("utf8").match(/^Pages:\s+(\d+)/m);
    const count = match ? Number(match[1]) : NaN;
    return Number.isInteger(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

async function extractPdfPages(buffer: Buffer): Promise<{ segments: KnowledgeSegment[]; pageCount: number | null; warning: string | null }> {
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("This file does not have a valid PDF signature.");
  }

  const pageCount = await getPdfPageCount(buffer);
  let text = "";
  try {
    text = (await runCommand(
      "pdftotext",
      ["-enc", "UTF-8", "-layout", "-", "-"],
      buffer,
      30_000,
      MAX_PDF_OUTPUT_BYTES,
    )).toString("utf8");
  } catch (error) {
    if (!pageCount) throw error;
  }

  const pageTexts = text.split("\f");
  const pages = pageTexts
    .map((pageText, index) => ({
      text: pageText.trim(),
      pageStart: index + 1,
      pageEnd: index + 1,
      section: inferSection(pageText),
    }))
    .filter((page) => page.text.length > 0);
  if (pages.length > 0) {
    return { segments: pages, pageCount, warning: null };
  }

  if (!pageCount) {
    throw new Error("The PDF has no extractable text and its page count could not be read.");
  }
  if (pageCount > MAX_OCR_PAGES) {
    throw new Error(`This scanned PDF has ${pageCount} pages. OCR is limited to ${MAX_OCR_PAGES} pages per document.`);
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "tinanai-ocr-"));
  const sourcePath = path.join(directory, "source.pdf");
  const prefixPath = path.join(directory, "page");
  const ocrPages: KnowledgeSegment[] = [];
  let totalChars = 0;
  try {
    await writeFile(sourcePath, buffer, { mode: 0o600 });
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      await runCommand(
        "pdftoppm",
        ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "120", "-png", sourcePath, prefixPath],
        undefined,
        30_000,
        1024,
      );
      const imagePath = `${prefixPath}.png`;
      try {
        const pageText = (await runCommand(
          "tesseract",
          [imagePath, "stdout", "-l", "eng", "--psm", "3"],
          undefined,
          45_000,
          128 * 1024,
        )).toString("utf8").trim();
        if (pageText) {
          totalChars += pageText.length;
          if (totalChars > MAX_EXTRACTED_CHARS) {
            throw new Error("OCR text exceeds the 4 MB processing limit.");
          }
          ocrPages.push({
            text: pageText,
            pageStart: pageNumber,
            pageEnd: pageNumber,
            section: inferSection(pageText),
          });
        }
      } finally {
        await rm(imagePath, { force: true });
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("tesseract is unavailable")) {
      throw new Error("This scanned PDF needs OCR, but the OCR engine is unavailable on this server.");
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  if (ocrPages.length === 0) {
    throw new Error("OCR could not read any text from this scanned PDF.");
  }
  return {
    segments: ocrPages,
    pageCount,
    warning: `Scanned PDF; text was extracted with OCR on ${ocrPages.length} readable page${ocrPages.length === 1 ? "" : "s"}.`,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const number = code[0]?.toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    });
}

async function extractDocx(buffer: Buffer): Promise<{ segments: KnowledgeSegment[]; warning: string | null }> {
  const entries = await readSafeArchiveEntries(buffer, true);
  try {
    if (!entries.some((entry) => entry.name.toLowerCase() === "word/document.xml")) {
      throw new Error("This file is a ZIP archive, but not a readable DOCX document.");
    }
  } finally {
    for (const entry of entries) entry.buffer.fill(0);
  }

  let result: Awaited<ReturnType<typeof import("mammoth")["convertToHtml"]>>;
  try {
    const mammoth = await import("mammoth");
    result = await mammoth.convertToHtml({ buffer });
  } catch {
    throw new Error("The DOCX document could not be read.");
  }
  const blocks = result.value.match(/<(h[1-6]|p|li|pre|td|th)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  let currentSection: string | null = null;
  const segments: KnowledgeSegment[] = [];
  for (const block of blocks) {
    const tag = block.match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase();
    const text = decodeHtmlEntities(block.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (tag && /^h[1-6]$/.test(tag)) {
      currentSection = text.slice(0, 240);
      continue;
    }
    segments.push({ text, pageStart: null, pageEnd: null, section: currentSection });
  }
  if (segments.length === 0) throw new Error("The DOCX document contains no readable text.");
  return {
    segments,
    warning: result.messages.length
      ? "Some DOCX formatting could not be preserved; page numbers are not reliable for this format."
      : "Page numbers are not reliable for this format; citations use section headings where available.",
  };
}

function decodeText(buffer: Buffer, filename: string): string {
  if (buffer.includes(0)) throw new Error(`${filename} is binary data, not a supported text document.`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    throw new Error(`${filename} is not valid UTF-8 text.`);
  }
}

function inferSection(text: string): string | null {
  const heading = text.split(/\r?\n/).map((line) => line.trim()).find((line) =>
    line.length >= 3
    && line.length <= 180
    && (/^#{1,6}\s+/.test(line) || /^\d+(?:\.\d+)*\s+\S/.test(line) || /^[A-Z][A-Z0-9 &,:;()/-]{2,}$/.test(line))
  );
  return heading ? heading.replace(/^#{1,6}\s+/, "").slice(0, 180) : null;
}

function makeTextSegments(text: string, filename: string): KnowledgeSegment[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  if (path.extname(filename.toLowerCase()) !== ".csv") {
    const segments: KnowledgeSegment[] = [];
    let currentSection: string | null = null;
    let currentLines: string[] = [];
    const flush = () => {
      const body = currentLines.join("\n").trim();
      if (body) segments.push({ text: body, pageStart: null, pageEnd: null, section: currentSection });
      currentLines = [];
    };
    for (const line of normalized.split("\n")) {
      const isHeading = /^#{1,6}\s+\S/.test(line)
        || /^\d+(?:\.\d+)*\s+\S/.test(line)
        || /^[A-Z][A-Z0-9 &,:;()/-]{2,}$/.test(line.trim());
      if (isHeading) {
        flush();
        currentSection = line.replace(/^#{1,6}\s+/, "").trim().slice(0, 180);
      } else {
        currentLines.push(line);
      }
    }
    flush();
    return segments.length
      ? segments
      : [{ text: normalized, pageStart: null, pageEnd: null, section: null }];
  }
  const lines = normalized.split("\n");
  const header = lines[0]?.trim() || "CSV data";
  const segments: KnowledgeSegment[] = [];
  const rowsPerSegment = 50;
  for (let start = 1; start < lines.length; start += rowsPerSegment) {
    const end = Math.min(lines.length, start + rowsPerSegment);
    segments.push({
      text: `${header}\n${lines.slice(start, end).join("\n")}`,
      pageStart: null,
      pageEnd: null,
      section: `Rows ${start + 1}–${end}`,
    });
  }
  return segments.length ? segments : [{ text: normalized, pageStart: null, pageEnd: null, section: "CSV data" }];
}

function splitSegment(segment: KnowledgeSegment): string[] {
  const text = segment.text.replace(/\s+/g, " ").trim();
  if (text.length <= CHUNK_CHAR_LIMIT) return text ? [text] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_CHAR_LIMIT);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      const space = text.lastIndexOf(" ", end);
      const boundary = Math.max(newline, space);
      if (boundary > start + Math.floor(CHUNK_CHAR_LIMIT * 0.55)) end = boundary;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function redactSegments(segments: KnowledgeSegment[]): { segments: KnowledgeSegment[]; changed: boolean } {
  let changed = false;
  const safe = segments.map((segment) => {
    const result = redactBuilderText(segment.text);
    changed ||= result.changed;
    return { ...segment, text: result.text };
  });
  return { segments: safe, changed };
}

export function createKnowledgeChunks(segments: KnowledgeSegment[]): KnowledgeChunkInput[] {
  const output: KnowledgeChunkInput[] = [];
  for (const segment of segments) {
    for (const text of splitSegment(segment)) {
      output.push({
        chunkIndex: output.length,
        text,
        pageStart: segment.pageStart,
        pageEnd: segment.pageEnd,
        section: segment.section,
      });
    }
  }
  return output;
}

async function extractSingleFile(buffer: Buffer, filename: string): Promise<{ segments: KnowledgeSegment[]; pageCount: number | null; warning: string | null }> {
  const extension = path.extname(filename.toLowerCase());
  if (extension === ".pdf") {
    return extractPdfPages(buffer);
  }
  if (extension === ".docx") {
    const result = await extractDocx(buffer);
    return { ...result, pageCount: null };
  }
  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`${filename} has an unsupported file format.`);
  }
  const source = decodeText(buffer, filename);
  let text = source;
  if (extension === ".json") {
    try {
      text = JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      throw new Error(`${filename} is not valid JSON.`);
    }
  }
  return {
    segments: makeTextSegments(text, filename),
    pageCount: null,
    warning: extension === ".csv" || extension === ".json"
      ? "This format has no reliable page numbers; citations use row ranges or text sections."
      : "This format has no reliable page numbers; citations use section headings where available.",
  };
}

export async function extractKnowledgeDocument(
  buffer: Buffer,
  filename: string,
): Promise<ExtractedKnowledgeDocument> {
  const format = getKnowledgeFileFormat(filename);
  if (!format) throw new Error(`${filename} has an unsupported file format.`);

  let segments: KnowledgeSegment[] = [];
  let pageCount: number | null = null;
  const warnings: string[] = [];
  if (format === "zip") {
    const signature = buffer.subarray(0, 4).toString("hex");
    if (!["504b0304", "504b0506", "504b0708"].includes(signature)) {
      throw new Error("This file does not have a valid ZIP signature.");
    }
    const entries = await readSafeArchiveEntries(buffer, true);
    if (entries.length === 0) throw new Error("The ZIP archive has no supported, non-secret files to index.");
    try {
      for (const entry of entries) {
        const result = await extractSingleFile(entry.buffer, entry.name);
        segments.push(...result.segments.map((segment) => ({
          ...segment,
          section: segment.section ? `${entry.name} · ${segment.section}` : entry.name,
        })));
        if (result.warning) warnings.push(result.warning);
      }
    } finally {
      for (const entry of entries) entry.buffer.fill(0);
    }
    warnings.push("Archive contents were inspected in memory; uploaded files and scripts were not executed.");
  } else {
    const result = await extractSingleFile(buffer, filename);
    segments = result.segments;
    pageCount = result.pageCount;
    if (result.warning) warnings.push(result.warning);
  }

  const redacted = redactSegments(segments);
  const totalChars = redacted.segments.reduce((total, segment) => total + segment.text.length, 0);
  if (totalChars > MAX_EXTRACTED_CHARS) {
    throw new Error("Extracted text exceeds the 4 MB per-document processing limit.");
  }
  if (redacted.segments.length === 0) {
    throw new Error("The document contains no readable text to index.");
  }

  return {
    segments: redacted.segments,
    pageCount,
    warning: [...new Set(warnings)].join(" ") || null,
    redacted: redacted.changed,
  };
}

