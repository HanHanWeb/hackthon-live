import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, normalizeConfig, type AppConfig } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

let lastKnownGood: AppConfig | null = null;

const defaultConfig = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;

async function readFromDisk(): Promise<AppConfig> {
  try {
    // 文件很小，每次完整读取可避免 readFile/stat 分离造成的缓存判断竞态，也能识别手改配置。
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = normalizeConfig(JSON.parse(raw));
    lastKnownGood = parsed;
    return parsed;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // 首次启动允许没有配置文件；已有配置被移动或删除时不丢掉最近的可用状态。
      return lastKnownGood ?? defaultConfig();
    }
    console.error(`[store] 读取配置失败，${lastKnownGood ? "使用最近一次可用配置" : "没有可用缓存"}`, cause);
    if (lastKnownGood) return lastKnownGood;
    // JSON 损坏、权限不足等故障不能伪装成默认配置；保存也会因此中止，保留原文件。
    throw cause;
  }
}

export async function getConfig(): Promise<AppConfig> {
  return readFromDisk();
}

const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

async function renameWithRetry(from: string, to: string, maxAttempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (!code || !RETRYABLE_RENAME_CODES.has(code) || attempt === maxAttempts) {
        throw cause;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

async function writeConfig(input: unknown): Promise<AppConfig> {
  let currentRevision = lastKnownGood?.revision ?? 0;
  try {
    const current = await getConfig();
    currentRevision = Math.max(currentRevision, current.revision);
  } catch {
    // 磁盘配置文件已损坏时允许用新的合法配置覆盖修复
  }

  const next = normalizeConfig(input);
  const saved: AppConfig = {
    ...next,
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(saved, null, 2) + "\n", "utf8");
    await renameWithRetry(tmp, CONFIG_FILE);
  } catch (cause) {
    await fs.unlink(tmp).catch(() => undefined);
    throw cause;
  }
  lastKnownGood = saved;
  return saved;
}

/** 写队列：并发 POST 串行落盘，避免两个请求读到同一 revision 而丢更新 */
let writeChain: Promise<unknown> = Promise.resolve();

export function saveConfig(input: unknown): Promise<AppConfig> {
  const queued = writeChain.then(
    () => writeConfig(input),
    () => writeConfig(input),
  );
  writeChain = queued.catch(() => undefined);
  return queued;
}
