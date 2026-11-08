export const responseLanguageCodes = ["en"] as const;

export type ResponseLanguage = (typeof responseLanguageCodes)[number];

export function isResponseLanguage(value: unknown): value is ResponseLanguage {
  return value === "en";
}

export function responseLanguageInstruction(_value: unknown): string {
  return [
    "Write all user-facing natural-language output in English.",
    "Keep code, identifiers, filenames, schemas, and exact source quotations unchanged when required.",
    "For generated interfaces, use English visible labels and set the document language to English.",
  ].join(" ");
}
