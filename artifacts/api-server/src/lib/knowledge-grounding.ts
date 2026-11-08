import type { KnowledgeSourceResult } from "./knowledge-service";

export interface GroundedKnowledgeAnswer {
  answer: string;
  citations: KnowledgeSourceResult[];
  insufficientEvidence: boolean;
}

interface ModelAnswer {
  answer: string;
  citationIds: string[];
  insufficientEvidence: boolean;
}

export function validateKnowledgeModelAnswer(
  modelText: string,
  sources: KnowledgeSourceResult[],
): GroundedKnowledgeAnswer | null {
  const firstBrace = modelText.indexOf("{");
  const lastBrace = modelText.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  let value: unknown;
  try {
    value = JSON.parse(modelText.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
  if (
    !value
    || typeof value !== "object"
    || !("answer" in value)
    || typeof value.answer !== "string"
    || value.answer.trim().length === 0
    || value.answer.length > 12_000
    || !("citationIds" in value)
    || !Array.isArray(value.citationIds)
    || value.citationIds.length > 12
    || !value.citationIds.every((id) => typeof id === "string")
    || !("insufficientEvidence" in value)
    || typeof value.insufficientEvidence !== "boolean"
  ) {
    return null;
  }
  const parsed = value as ModelAnswer;
  const sourceById = new Map(sources.map((source) => [source.chunkId, source]));
  const citations = [...new Set(parsed.citationIds)]
    .map((id) => sourceById.get(id))
    .filter((source): source is KnowledgeSourceResult => source !== undefined);
  if (parsed.insufficientEvidence || citations.length === 0) {
    return {
      answer: "I couldn't verify an answer from the relevant excerpts currently indexed in your library. Try a different collection or add a source that covers this question.",
      citations,
      insufficientEvidence: true,
    };
  }
  return { answer: parsed.answer, citations, insufficientEvidence: false };
}
