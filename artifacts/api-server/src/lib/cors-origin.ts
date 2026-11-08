const insecureDevelopmentHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseCorsAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const value of raw?.split(",") ?? []) {
    const candidate = value.trim();
    if (!candidate) continue;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error("TINANAI_CORS_ALLOWED_ORIGINS must contain valid HTTP(S) origins.");
    }

    const isSecure = parsed.protocol === "https:";
    const isLocalDevelopment = parsed.protocol === "http:" && insecureDevelopmentHosts.has(parsed.hostname);
    if (
      (!isSecure && !isLocalDevelopment) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.origin === "null"
    ) {
      throw new Error("TINANAI_CORS_ALLOWED_ORIGINS must contain origins only; use HTTPS except for localhost development.");
    }

    allowed.add(parsed.origin);
  }
  return allowed;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): origin is string {
  return typeof origin === "string" && allowedOrigins.has(origin);
}
