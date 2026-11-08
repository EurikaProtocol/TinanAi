import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { localeMessages, uiKeys, type UiKey } from "./catalog";
import { localeDirection, type Locale } from "./locales";

const STORAGE_KEY = "tinanai.locale.v1";
const keyIndex = new Map<string, number>(uiKeys.map((key, index) => [key, index]));
const localizedProps = new Set([
  "aria-label",
  "alt",
  "title",
  "placeholder",
  "label",
  "message",
  "description",
  "desc",
  "eyebrow",
]);
export function getCurrentLocale(): Locale {
  return "en";
}

export function translateUiText(text: string, locale: Locale): string {
  const index = keyIndex.get(text);
  return index === undefined
    ? text
    : (localeMessages[locale][index] ?? localeMessages.en[index] ?? text);
}

interface I18nContextValue {
  locale: Locale;
  t: (key: UiKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale: Locale = "en";

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = localeDirection(locale);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The interface remains English for this session if storage is unavailable.
    }
  }, []);

  const t = useCallback((key: UiKey) => translateUiText(key, locale), []);
  const value = useMemo(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}

function translateNode(node: ReactNode, locale: Locale): ReactNode {
  if (typeof node === "string") return translateUiText(node, locale);
  if (Array.isArray(node)) return node.map((child) => translateNode(child, locale));
  if (!isValidElement(node)) return node;

  const sourceProps = node.props as Record<string, unknown>;
  if (sourceProps["data-no-translate"] === true || sourceProps["data-no-translate"] === "true") {
    return node;
  }
  const props: Record<string, unknown> = { ...sourceProps };
  for (const [name, value] of Object.entries(sourceProps)) {
    if (name === "children") {
      props.children = Children.map(value as ReactNode, (child) => translateNode(child, locale));
    } else if (
      localizedProps.has(name) &&
      typeof value === "string" &&
      sourceProps[`data-no-translate-${name}`] !== true
    ) {
      props[name] = translateUiText(value, locale);
    } else if (Array.isArray(value) || isValidElement(value)) {
      props[name] = translateNode(value as ReactNode, locale);
    }
  }
  if (node.type === "option" && sourceProps.value === undefined) {
    const originalLabel = sourceProps.children;
    if (typeof originalLabel === "string") props.value = originalLabel;
  }
  return cloneElement(node as React.ReactElement<Record<string, unknown>>, props);
}

export function translateTemplate(
  template: string,
  locale: Locale,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    translateUiText(template, locale),
  );
}

/**
 * Localizes static JSX text and common text attributes by their English source key.
 * Explicit translation calls remain available through useI18n().t for non-JSX strings.
 */
export function LocalizedTree({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <>{translateNode(children, locale)}</>;
}

export type { Locale, UiKey };
export { isLocale, localeDirection, localeFromStorage, locales } from "./locales";
