export interface TinanaiResearchSource {
  title: string;
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractResearchSources(output: unknown): TinanaiResearchSource[] {
  if (!Array.isArray(output)) return [];

  const sources: TinanaiResearchSource[] = [];
  const seen = new Set<string>();

  for (const message of output) {
    if (!isRecord(message) || message.type !== "message" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (!isRecord(part) || !Array.isArray(part.annotations)) continue;
      for (const annotation of part.annotations) {
        if (
          !isRecord(annotation) ||
          annotation.type !== "url_citation" ||
          typeof annotation.url !== "string" ||
          typeof annotation.title !== "string"
        ) {
          continue;
        }

        let url: URL;
        try {
          url = new URL(annotation.url);
        } catch {
          continue;
        }
        if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) {
          continue;
        }

        const title = annotation.title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
        if (!title) continue;

        seen.add(url.href);
        sources.push({ title: title.slice(0, 240), url: url.href });
        if (sources.length === 12) return sources;
      }
    }
  }

  return sources;
}
