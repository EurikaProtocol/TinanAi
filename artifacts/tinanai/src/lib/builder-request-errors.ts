type BuilderErrorPayload = {
  status?: unknown;
  data?: unknown;
};

function redactedMessage(value: string): string {
  return value
    .replace(/\b(api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|password|secret|auth[_-]?token|token)\b(\s*[:=]\s*)(["'])([^"'\r\n]{8,})\3/gi, (_match, key: string, separator: string, quote: string) => `${key}${separator}${quote}[REDACTED]${quote}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 500);
}

export function builderGenerationErrorMessage(error: unknown, outputType: string): string {
  const value = error && typeof error === "object" ? error as BuilderErrorPayload : {};
  const status = typeof value.status === "number" ? value.status : null;
  const data = value.data && typeof value.data === "object" ? value.data as { error?: unknown } : null;
  const serverMessage = typeof data?.error === "string" ? redactedMessage(data.error) : "";

  if (status !== null && status < 500 && serverMessage) return serverMessage;
  if (status === 413) {
    return serverMessage || "The request exceeded the upload limits. Each file must be 20 MB or smaller and all files together must be 50 MB or smaller.";
  }
  if (outputType === "app") {
    return "Generation failed. No app was generated. Your prompt and uploads are still available; choose a deterministic local template or retry.";
  }
  return `Generation failed. No ${outputType} output was generated. Your prompt and uploads are still available; retry when ready.`;
}
