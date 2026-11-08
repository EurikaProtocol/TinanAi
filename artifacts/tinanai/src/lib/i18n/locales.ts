export const locales = [
  { code: "en", name: "English", clerk: "enUS" },
] as const;

export type Locale = (typeof locales)[number]["code"];

export function isLocale(value: unknown): value is Locale {
  return value === "en";
}

export function localeFromStorage(_value: string | null | undefined): Locale {
  return "en";
}

export function localeDirection(_locale: Locale): "ltr" {
  return "ltr";
}
