export type ThemeKey =
  | 'bg' | 'surface' | 'surface_alt' | 'rule' | 'ink' | 'ink_soft' | 'accent' | 'accent_ink'
  | 'highlight' | 'pos' | 'neg' | 'masthead_bg' | 'masthead_ink' | 'masthead_rule'
  | 'font_display' | 'font_body';
export type Theme = Record<ThemeKey, string>;
export declare const COLOR_FIELDS: { key: ThemeKey; label: string; group: 'Paper' | 'Ink' | 'Masthead' }[];
export declare const FONTS: Record<string, { stack: string; google: string | null }>;
export declare const PRESETS: Record<string, Theme>;
export declare const DEFAULT_THEME: Theme;
export declare const COPY: Record<string, { group: string; label: string; text: string }>;
export declare function fill(text: string, vars?: Record<string, string | number>): string;
export declare function placeholders(key: string): string[];
export declare function isColor(value: unknown): value is string;
export declare function cleanTheme(theme: unknown): Record<string, string>;
export declare function cleanCopy(copy: unknown): Record<string, string>;
export declare function themeChanges(theme: unknown): Record<string, string>;
export declare function contrast(a: string, b: string): number;
export declare const READABLE_PAIRS: [ThemeKey, ThemeKey, string][];
export declare function readabilityWarnings(theme: unknown): { label: string; ratio: number }[];
export declare function cssVars(theme: unknown): Record<string, string>;
export declare function fontsHref(theme: unknown): string | null;
