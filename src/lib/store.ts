import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, normalizeConfig, type AppConfig } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

let cache: AppConfig | null = null;
let cacheMtime = 0;

async function readFromDisk(): Promise<AppConfig> {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(CONFIG_FILE, "utf8"), fs.stat(CONFIG_FILE)]);
    if (cache && stat.mtimeMs === cacheMtime) return cache;
    const parsed = normalizeConfig(JSON.parse(raw));
    cache = parsed;
    cacheMtime = stat.mtimeMs;
    return parsed;
  } catch {
    // 深拷贝，避免调用方原地修改污染模块级默认值
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;
  }
}

export async function getConfig(): Promise<AppConfig> {
  return readFromDisk();
}

async function writeConfig(input: unknown): Promise<AppConfig> {
  const current = await getConfig();
  const next = normalizeConfig(input);
  const saved: AppConfig = {
    ...next,
    revision: Math.max(current.revision + 1, next.revision),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = CONFIG_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(saved, null, 2) + "\n", "utf8");
  await fs.rename(tmp, CONFIG_FILE);
  cache = saved;
  cacheMtime = (await fs.stat(CONFIG_FILE)).mtimeMs;
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
