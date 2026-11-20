const pad = (value: number) => String(value).padStart(2, "0");

/**
 * 解析 "YYYY-MM-DDTHH:mm" 形式的本地时间字符串。
 * 手工拆分而不是 new Date(string)：既能保证「无时区字符串按本地时间解释」，
 * 也能拒绝 2026-13-45T99:99 这类会被 Date 静默进位的非法值。
 */
export function parseLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const seconds = second || 0;
  const date = new Date(year, month - 1, day, hour, minute, seconds, 0);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === seconds;
  return valid ? date : null;
}

/** 2026.11.20 09:00 */
export function formatStamp(date: Date): string {
  return (
    date.getFullYear() +
    "." +
    pad(date.getMonth() + 1) +
    "." +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

/** 23:59:07 */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function diffDuration(targetMs: number, nowMs: number): Duration {
  const totalMs = Math.max(0, targetMs - nowMs);
  const seconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    totalMs,
  };
}

/** 一小时内的补充里程碑（剩余秒数），从大到小；整小时由 nearMilestone 动态计算。 */
const SUB_HOUR_MILESTONES_SECONDS: number[] = (() => {
  const list = new Set<number>([1800, 1200, 600, 300, 180, 120, 60]);
  for (let minute = 9; minute >= 1; minute -= 1) list.add(minute * 60);
  return [...list].sort((a, b) => b - a);
})();

/**
 * 剩余时间是否落在某个「整点」附近。
 * 窗口 = [里程碑 - hold 秒, 里程碑 + lead 秒]：
 * 例如剩余 3 小时、提前 60 秒时，剩余 3:01:00 就会切到倒计时，跨过 3:00:00 后还能保持 hold 秒。
 */
export function nearMilestone(remainingMs: number, leadSeconds: number, holdSeconds: number): boolean {
  if (remainingMs <= 0) return true;
  const remaining = remainingMs / 1000;
  const lead = Math.max(0, leadSeconds);
  const hold = Math.max(0, holdSeconds);
  const inWindow = (milestone: number) => remaining >= milestone - hold && remaining <= milestone + lead;
  // 不限制 48 小时：找到距离当前剩余时间最近的整小时即可。
  const nearestHour = Math.max(3600, Math.round(remaining / 3600) * 3600);
  if (inWindow(nearestHour)) return true;
  for (const milestone of SUB_HOUR_MILESTONES_SECONDS) {
    if (remaining > milestone + lead) break;
    if (remaining >= milestone - hold) return true;
  }
  return false;
}

/** 把数字格式化成固定位数的字符串，至少 minDigits 位 */
export function digitsOf(value: number, minDigits = 2): string {
  const text = String(Math.max(0, Math.floor(value)));
  return text.length >= minDigits ? text : "0".repeat(minDigits - text.length) + text;
}
