import { parseLocal } from "./time";

export type DisplayMode = "countdown" | "motto" | "auto";

export type MottoPosition =
  | "center"
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type MottoAnimation = "from-bottom" | "slide-left" | "slide-right";

export type TextAlign = "left" | "center" | "right";

export type CountdownFont = "din" | "mono";

export interface CountdownConfig {
  /** 主标题，例如 HACKATHON 2026 */
  title: string;
  /** 副标题 */
  subtitle: string;
  /** 目标时间，本地时间 naive 字符串：YYYY-MM-DDTHH:mm */
  targetAt: string;
  /** 倒计时结束后的文案 */
  finishedText: string;
  /** 倒计时数字字体：D-DIN 或原来的 JetBrains Mono */
  font: CountdownFont;
}

export const COUNTDOWN_FONTS: { value: CountdownFont; label: string }[] = [
  { value: "din", label: "D-DIN" },
  { value: "mono", label: "JetBrains Mono" },
];

/** 四个单位文案：写死，不开放配置 */
export const COUNTDOWN_LABELS = {
  days: "DAYS",
  hours: "HOURS",
  minutes: "MINUTES",
  seconds: "SECONDS",
} as const;

/** 格言上限：后台每行一句，最多 50 句、单句 400 字 */
export const QUOTE_MAX_COUNT = 50;
export const QUOTE_MAX_CHARS = 400;
export const TEXT_LIMITS = {
  title: 120,
  subtitle: 200,
  finishedText: 200,
  author: 60,
} as const;

export interface MottoConfig {
  quotes: string[];
  position: MottoPosition;
  align: TextAlign;
  /** 字号（以 1080p 为基准的 px） */
  fontSize: number;
  animation: MottoAnimation;
  /** 自动轮换秒数，0 表示不自动轮换 */
  rotateSeconds: number;
  author: string;
}

export interface ThemeConfig {
  accent: string;
  accent2: string;
  showGrid: boolean;
  glow: boolean;
  scanlines: boolean;
}

export interface AppConfig {
  mode: DisplayMode;
  /** auto 模式下两种形式各自的停留秒数（未开启整点对齐时使用） */
  autoSeconds: number;
  /** auto 模式：按剩余时间的整点切换（剩余 3 小时等），否则按固定间隔轮播 */
  autoAlign: boolean;
  /** 整点前多少秒切到倒计时 */
  autoLeadSeconds: number;
  /** 整点过后继续停留在倒计时的秒数 */
  autoHoldSeconds: number;
  countdown: CountdownConfig;
  motto: MottoConfig;
  theme: ThemeConfig;
  revision: number;
  updatedAt: string;
}

export const MOTTO_POSITIONS: { value: MottoPosition; label: string }[] = [
  { value: "top-left", label: "左上" },
  { value: "top", label: "上中" },
  { value: "top-right", label: "右上" },
  { value: "left", label: "左中" },
  { value: "center", label: "居中" },
  { value: "right", label: "右中" },
  { value: "bottom-left", label: "左下" },
  { value: "bottom", label: "下中" },
  { value: "bottom-right", label: "右下" },
];

export const MOTTO_ANIMATIONS: { value: MottoAnimation; label: string }[] = [
  { value: "from-bottom", label: "切入" },
  { value: "slide-left", label: "左侧滑入" },
  { value: "slide-right", label: "右侧滑入" },
];

export const DEFAULT_CONFIG: AppConfig = {
  mode: "countdown",
  autoSeconds: 20,
  autoAlign: true,
  autoLeadSeconds: 60,
  autoHoldSeconds: 45,
  countdown: {
    title: "HACKATHON 2026",
    subtitle: "48 小时，从零到一",
    targetAt: "2026-11-20T09:00",
    finishedText: "代码已开写 · LET'S BUILD",
    font: "din",
  },
  motto: {
    quotes: [
      "Stay hungry, stay foolish.",
      "把不可能，拆成一个个待办。",
      "今晚写下的代码，明天就会长大。",
    ],
    position: "center",
    align: "center",
    fontSize: 72,
    animation: "from-bottom",
    rotateSeconds: 8,
    author: "",
  },
  theme: {
    accent: "#8b5cf6",
    accent2: "#22d3ee",
    showGrid: true,
    glow: true,
    scanlines: false,
  },
  revision: 1,
  updatedAt: new Date(0).toISOString(),
};

const POSITIONS = new Set(MOTTO_POSITIONS.map((p) => p.value));
const ANIMATIONS = new Set(MOTTO_ANIMATIONS.map((a) => a.value));
const MODES = new Set<DisplayMode>(["countdown", "motto", "auto"]);
const COUNTDOWN_FONT_VALUES = new Set<string>(COUNTDOWN_FONTS.map((font) => font.value));

const str = (value: unknown, fallback: string, max = 4000): string =>
  typeof value === "string" ? value.slice(0, max) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const num = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const color = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

/** 只接受真实存在、且形如 YYYY-MM-DDTHH:mm 的本地时间 */
const dateLocal = (value: unknown, fallback: string): string =>
  typeof value === "string" && parseLocal(value) !== null ? value : fallback;

export interface ConfigIssue {
  field:
    | "root"
    | "countdown.title"
    | "countdown.subtitle"
    | "countdown.targetAt"
    | "countdown.finishedText"
    | "motto.quotes"
    | "motto.author"
    | "theme.accent"
    | "theme.accent2";
  message: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 保存前显式校验会被 normalizeConfig 截断或丢弃的内容，避免用户以为原文已保存。 */
export function validateConfigInput(input: unknown): ConfigIssue[] {
  if (!isPlainObject(input)) {
    return [{ field: "root", message: "配置必须是合法的 JSON 对象。" }];
  }

  const raw = input;
  if (
    (raw.countdown !== undefined && !isPlainObject(raw.countdown)) ||
    (raw.motto !== undefined && !isPlainObject(raw.motto)) ||
    (raw.theme !== undefined && !isPlainObject(raw.theme))
  ) {
    return [{ field: "root", message: "配置结构不合法。" }];
  }

  const countdown = (raw.countdown ?? {}) as Record<string, unknown>;
  const motto = (raw.motto ?? {}) as Record<string, unknown>;
  const theme = (raw.theme ?? {}) as Record<string, unknown>;
  const issues: ConfigIssue[] = [];
  const checkLength = (value: unknown, limit: number, field: ConfigIssue["field"], label: string) => {
    if (typeof value === "string" && value.length > limit) {
      issues.push({ field, message: `${label}不能超过 ${limit} 字，当前 ${value.length} 字。` });
    }
  };

  checkLength(countdown.title, TEXT_LIMITS.title, "countdown.title", "主标题");
  checkLength(countdown.subtitle, TEXT_LIMITS.subtitle, "countdown.subtitle", "副标题");
  checkLength(countdown.finishedText, TEXT_LIMITS.finishedText, "countdown.finishedText", "倒计时结束文案");
  checkLength(motto.author, TEXT_LIMITS.author, "motto.author", "署名");

  if (
    typeof countdown.targetAt === "string" &&
    countdown.targetAt.trim().length > 0 &&
    parseLocal(countdown.targetAt) === null
  ) {
    issues.push({ field: "countdown.targetAt", message: "倒计时结束时间格式无效。" });
  }

  if (typeof theme.accent === "string" && !/^#[0-9a-fA-F]{6}$/.test(theme.accent)) {
    issues.push({ field: "theme.accent", message: "主色必须是 6 位十六进制颜色值（如 #8b5cf6）。" });
  }

  if (typeof theme.accent2 === "string" && !/^#[0-9a-fA-F]{6}$/.test(theme.accent2)) {
    issues.push({ field: "theme.accent2", message: "辅色必须是 6 位十六进制颜色值（如 #22d3ee）。" });
  }

  if (Array.isArray(motto.quotes)) {
    const nonEmptyQuotes = motto.quotes.filter((quote) => typeof quote === "string" && quote.trim().length > 0);
    if (nonEmptyQuotes.length > QUOTE_MAX_COUNT) {
      issues.push({ field: "motto.quotes", message: `格言最多 ${QUOTE_MAX_COUNT} 句，当前 ${nonEmptyQuotes.length} 句。` });
    }
    const longQuoteIndex = motto.quotes.findIndex((quote) => typeof quote === "string" && quote.length > QUOTE_MAX_CHARS);
    if (longQuoteIndex >= 0) {
      issues.push({ field: "motto.quotes", message: `第 ${longQuoteIndex + 1} 句格言不能超过 ${QUOTE_MAX_CHARS} 字。` });
    }
  }

  return issues;
}

/** 把任意输入收敛成一份合法的配置，永远不抛错 */
export function normalizeConfig(input: unknown): AppConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const countdownRaw = (raw.countdown ?? {}) as Record<string, any>;
  const mottoRaw = (raw.motto ?? {}) as Record<string, any>;
  const themeRaw = (raw.theme ?? {}) as Record<string, any>;

  // 显式传入（哪怕是空数组）就以传入内容为准，避免「清空格言后又被默认文案填回去」
  const quotes = Array.isArray(mottoRaw.quotes)
    ? mottoRaw.quotes
        .filter((q: unknown): q is string => typeof q === "string")
        .map((q: string) => q.slice(0, QUOTE_MAX_CHARS))
        .filter((q: string) => q.trim().length > 0)
        .slice(0, QUOTE_MAX_COUNT)
    : [...DEFAULT_CONFIG.motto.quotes];

  return {
    mode: MODES.has(raw.mode as DisplayMode) ? (raw.mode as DisplayMode) : DEFAULT_CONFIG.mode,
    autoSeconds: num(raw.autoSeconds, DEFAULT_CONFIG.autoSeconds, 5, 600),
    autoAlign: bool(raw.autoAlign, DEFAULT_CONFIG.autoAlign),
    autoLeadSeconds: num(raw.autoLeadSeconds, DEFAULT_CONFIG.autoLeadSeconds, 0, 600),
    autoHoldSeconds: num(raw.autoHoldSeconds, DEFAULT_CONFIG.autoHoldSeconds, 0, 600),
    countdown: {
      title: str(countdownRaw.title, DEFAULT_CONFIG.countdown.title, TEXT_LIMITS.title),
      subtitle: str(countdownRaw.subtitle, DEFAULT_CONFIG.countdown.subtitle, TEXT_LIMITS.subtitle),
      targetAt: dateLocal(countdownRaw.targetAt, ""),
      finishedText: str(countdownRaw.finishedText, DEFAULT_CONFIG.countdown.finishedText, TEXT_LIMITS.finishedText),
      font: COUNTDOWN_FONT_VALUES.has(countdownRaw.font)
        ? (countdownRaw.font as CountdownFont)
        : DEFAULT_CONFIG.countdown.font,
    },
    motto: {
      quotes,
      position: POSITIONS.has(mottoRaw.position) ? (mottoRaw.position as MottoPosition) : DEFAULT_CONFIG.motto.position,
      align: (["left", "center", "right"] as const).includes(mottoRaw.align) ? (mottoRaw.align as TextAlign) : DEFAULT_CONFIG.motto.align,
      fontSize: num(mottoRaw.fontSize, DEFAULT_CONFIG.motto.fontSize, 24, 160),
      animation: ANIMATIONS.has(mottoRaw.animation) ? (mottoRaw.animation as MottoAnimation) : DEFAULT_CONFIG.motto.animation,
      rotateSeconds: num(mottoRaw.rotateSeconds, DEFAULT_CONFIG.motto.rotateSeconds, 0, 600),
      author: str(mottoRaw.author, DEFAULT_CONFIG.motto.author, TEXT_LIMITS.author),
    },
    theme: {
      accent: color(themeRaw.accent, DEFAULT_CONFIG.theme.accent),
      accent2: color(themeRaw.accent2, DEFAULT_CONFIG.theme.accent2),
      showGrid: bool(themeRaw.showGrid, DEFAULT_CONFIG.theme.showGrid),
      glow: bool(themeRaw.glow, DEFAULT_CONFIG.theme.glow),
      scanlines: bool(themeRaw.scanlines, DEFAULT_CONFIG.theme.scanlines),
    },
    revision: num(raw.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : DEFAULT_CONFIG.updatedAt,
  };
}
