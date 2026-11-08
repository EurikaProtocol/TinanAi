import { randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { authorizePaidService } from "../lib/tinan-payment-gate";
import type { Request, Response, NextFunction, IRouter } from "express";
import { Router } from "express";
import multer from "multer";
import {
  GenerateTinanaiBuilderBody,
  GenerateTinanaiBuilderResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  BuilderFileError,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_REQUEST_BYTES,
  inspectBuilderFiles,
  redactBuilderText,
  sanitizeFileName,
} from "../lib/builder-files";
import { buildTinanaiBuilderOutput, builderSystemPrompt, builderUserPrompt } from "../lib/builder-generation";
import { responseLanguageInstruction } from "../lib/response-language";

const router: IRouter = Router();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const reservedRequests = new WeakSet<Request>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 6;
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_UPLOAD_FORM_FIELDS = 3;
const MAX_UPLOAD_MULTIPART_OVERHEAD_BYTES = 192 * 1024;
const EXPORT_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_EXPORT_BYTES = 50 * 1024 * 1024;
const MAX_DOWNLOADS_PER_EXPORT = 3;
let activeRequests = 0;
let cachedExportBytes = 0;

interface CachedExport {
  name: string;
  content: Buffer;
  expiresAt: number;
  remainingDownloads: number;
}

const cachedExports = new Map<string, CachedExport>();
const requestBytes = new WeakMap<Request, number>();

function releaseSlot(req: Request): void {
  if (!reservedRequests.has(req)) return;
  reservedRequests.delete(req);
  activeRequests = Math.max(0, activeRequests - 1);
}

function takeRequestSlot(ip: string): boolean {
  const now = Date.now();
  for (const [key, value] of requestWindows) {
    if (now - value.startedAt >= WINDOW_MS) requestWindows.delete(key);
  }
  const current = requestWindows.get(ip);
  if (!current) {
    requestWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function reserveRequest(req: Request, res: Response, next: NextFunction): void {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || !takeRequestSlot(req.ip ?? "shared-preview")) {
    res.setHeader("Retry-After", "900");
    res.status(429).json({ error: "The Builder is busy or its request limit was reached. Try again later." });
    return;
  }
  activeRequests += 1;
  reservedRequests.add(req);
  res.on("close", () => {
    if (!res.writableEnded) releaseSlot(req);
  });
  next();
}

function makeBoundedMemoryStorage(): multer.StorageEngine {
  return {
    _handleFile(req, file, callback) {
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      let failed = false;
      file.stream.on("data", (chunk: Buffer) => {
        if (failed) return;
        fileBytes += chunk.length;
        const totalBytes = (requestBytes.get(req) ?? 0) + chunk.length;
        requestBytes.set(req, totalBytes);
        if (fileBytes > MAX_UPLOAD_FILE_BYTES) {
          failed = true;
          chunks.length = 0;
          callback(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
          return;
        }
        if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
          failed = true;
          chunks.length = 0;
          const error = new Error("Upload request exceeds the configured total limit.") as Error & { code?: string };
          error.code = "LIMIT_TOTAL_UPLOAD_SIZE";
          callback(error);
          return;
        }
        chunks.push(chunk);
      });
      file.stream.on("error", (error) => {
        if (failed) return;
        failed = true;
        callback(error);
      });
      file.stream.on("end", () => {
        if (failed) return;
        callback(null, { buffer: Buffer.concat(chunks, fileBytes), size: fileBytes });
      });
    },
    _removeFile(_req, file, callback) {
      file.buffer = Buffer.alloc(0);
      callback(null);
    },
  };
}

const upload = multer({
  storage: makeBoundedMemoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_FILE_BYTES,
    files: MAX_UPLOAD_FILES,
    fields: MAX_UPLOAD_FORM_FIELDS,
    // The 12,000-character prompt limit can require up to 48,000 UTF-8 bytes.
    fieldSize: 48_000,
    fieldNameSize: 100,
    parts: MAX_UPLOAD_FILES + MAX_UPLOAD_FORM_FIELDS,
  },
  fileFilter(_req, file, callback) {
    try {
      const name = sanitizeFileName(file.originalname);
      const lower = name.toLowerCase();
      const extension = lower.endsWith(".env.example")
        ? ".env.example"
        : lower.slice(lower.lastIndexOf("."));
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        callback(new BuilderFileError("Unsupported file type. Upload a supported text, data, PDF, XLSX, ZIP, or source file."));
        return;
      }
      callback(null, true);
    } catch (error) {
      callback(error instanceof Error ? error : new BuilderFileError("Unsupported filename."));
    }
  },
}).array("files", MAX_UPLOAD_FILES);

function uploadFailureStatus(error: unknown): { status: number; message: string } {
  if (error instanceof BuilderFileError) return { status: error.statusCode, message: error.message };
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return { status: 413, message: "Each uploaded file must fit the configured 20 MB limit." };
    }
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      return { status: 413, message: `Upload no more than ${MAX_UPLOAD_FILES} files at once.` };
    }
    if (error.code === "LIMIT_FIELD_VALUE") {
      return { status: 413, message: "A request field exceeded the size limit. Keep the prompt to 12,000 characters or fewer." };
    }
    if (error.code === "LIMIT_PART_COUNT") {
      return { status: 413, message: `The request contains too many parts. Upload no more than ${MAX_UPLOAD_FILES} files at once.` };
    }
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === "LIMIT_TOTAL_UPLOAD_SIZE") {
    return { status: 413, message: "The total upload exceeds the configured 50 MB request limit." };
  }
  return {
    status: 400,
    message: "The upload request is invalid. Check the file type, filename, and multipart form data.",
  };
}

function parseMultipart(req: Request, res: Response, next: NextFunction): void {
  const length = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(length) && length > MAX_UPLOAD_REQUEST_BYTES + MAX_UPLOAD_MULTIPART_OVERHEAD_BYTES) {
    releaseSlot(req);
    res.status(413).json({ error: "The total upload exceeds the configured 50 MB request limit." });
    return;
  }
  upload(req, res, (error: unknown) => {
    if (error) {
      releaseSlot(req);
      const failure = uploadFailureStatus(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    next();
  });
}

function purgeExpiredExports(): void {
  const now = Date.now();
  for (const [id, item] of cachedExports) {
    if (item.expiresAt <= now || item.remainingDownloads <= 0) {
      cachedExportBytes -= item.content.byteLength;
      cachedExports.delete(id);
    }
  }
}

function cacheCsvExport(name: string, content: string): string | null {
  purgeExpiredExports();
  const buffer = Buffer.from(content, "utf8");
  if (buffer.length > MAX_CACHED_EXPORT_BYTES) return null;
  if (cachedExportBytes + buffer.length > MAX_CACHED_EXPORT_BYTES) return null;
  const id = randomBytes(32).toString("hex");
  cachedExports.set(id, {
    name,
    content: buffer,
    expiresAt: Date.now() + EXPORT_TTL_MS,
    remainingDownloads: MAX_DOWNLOADS_PER_EXPORT,
  });
  cachedExportBytes += buffer.length;
  return `/api/tinanai/builder/exports/${id}`;
}

router.get("/tinanai/builder/exports/:id", (req, res): void => {
  purgeExpiredExports();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = cachedExports.get(id ?? "");
  if (!item || !/^[a-f0-9]{64}$/.test(id ?? "")) {
    res.status(404).json({ error: "This temporary download has expired. Run the analysis again to create a new one." });
    return;
  }
  item.remainingDownloads -= 1;
  if (item.remainingDownloads <= 0) {
    cachedExports.delete(id);
    cachedExportBytes -= item.content.byteLength;
  }
  const asciiName = item.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "cleaned-data.csv";
  const encodedName = encodeURIComponent(item.name).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.status(200).send(item.content);
});

router.post(
  "/tinanai/builder/generate",
  reserveRequest,
  parseMultipart,
  async (req, res): Promise<void> => {
    try {
      const request = GenerateTinanaiBuilderBody.pick({ outputType: true, prompt: true, language: true }).safeParse(req.body);
      if (!request.success) {
        res.status(400).json({ error: "Choose an output type and enter a prompt (up to 12,000 characters)." });
        return;
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const processing = await inspectBuilderFiles(files);
      const safePrompt = redactBuilderText(request.data.prompt);
      if (safePrompt.changed) {
        processing.warnings.push("Secret-like values in the prompt were redacted before AI processing.");
      }
      if (request.data.outputType === "analytics" && processing.datasets.length === 0) {
        res.status(400).json({ error: "Analytics needs a CSV, XLSX, or tabular JSON file to calculate real statistics." });
        return;
      }
      const paidService = request.data.outputType === "app" ? "app-generation" : request.data.outputType === "token" ? "contract-generation" : "ai-builder";
      if (!await authorizePaidService(req, res, paidService)) return;
      const response = await openai.chat.completions.create(
        {
          model: request.data.outputType === "app" ? "gpt-5.6-terra" : "gpt-5.4-mini",
          max_completion_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${builderSystemPrompt(request.data.outputType)}\n\n${responseLanguageInstruction(request.data.language)}`,
            },
            { role: "user", content: builderUserPrompt(safePrompt.text, processing.context) },
          ],
        },
        { timeout: 120_000 },
      );
      req.log.info(
        {
          userId: getAuth(req).userId ?? null,
          model: "gpt-5.6-terra",
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        "TINANAI Builder usage",
      );
      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) {
        res.status(502).json({ error: "EUREKA CORE returned an empty result. Your files were discarded; retry the request." });
        return;
      }
      const generated = await buildTinanaiBuilderOutput(request.data.outputType, reply, processing);
      const datasets = processing.datasets.map((dataset, index) => {
        const file = processing.cleanCsvExports[index];
        if (!file) return dataset;
        const cleanCsvUrl = cacheCsvExport(file.name, file.content);
        return {
          ...dataset,
          cleanCsvUrl,
          cleanCsvBytes: cleanCsvUrl ? Buffer.byteLength(file.content, "utf8") : null,
        };
      });
      const result = GenerateTinanaiBuilderResponse.parse({
        outputType: request.data.outputType,
        summary: generated.summary,
        uploads: processing.uploads,
        artifacts: generated.artifacts,
        datasets,
        tokenCompilation: generated.tokenCompilation,
        warnings: [
          ...new Set([
            ...processing.warnings,
            ...generated.warnings,
            ...(processing.cleanCsvExports.some((file, index) => !datasets[index]?.cleanCsvUrl)
              ? ["A cleaned CSV download could not be retained in temporary memory; reduce the dataset and retry."]
              : []),
          ]),
        ],
      });
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof BuilderFileError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      req.log.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "TINANAI Builder generation failed",
      );
      const message = error instanceof Error && /AI response|generated|token|JSON|Solidity|export|upload/i.test(error.message)
        ? error.message
        : "EUREKA CORE could not complete the request. The temporary upload was discarded; retry with a smaller or clearer request.";
      res.status(502).json({ error: message });
    } finally {
      releaseSlot(req);
    }
  },
);

export default router;
