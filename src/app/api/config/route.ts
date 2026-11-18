import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config, { headers: NO_STORE });
}

const MAX_BODY_LENGTH = 256 * 1024;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: "配置体积过大" }, { status: 413, headers: NO_STORE });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400, headers: NO_STORE });
  }

  try {
    const saved = await saveConfig(payload);
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (cause) {
    console.error("[api/config] 写入配置失败", cause);
    return NextResponse.json({ error: "写入配置失败，请检查 data 目录权限" }, { status: 500, headers: NO_STORE });
  }
}
