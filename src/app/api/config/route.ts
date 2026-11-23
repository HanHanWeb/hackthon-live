import { NextResponse } from "next/server";
import { validateConfigInput } from "@/lib/config";
import { getConfig, saveConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

export async function GET() {
  try {
    const config = await getConfig();
    return NextResponse.json(config, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "读取配置失败，请检查配置文件和目录权限" }, { status: 500, headers: NO_STORE });
  }
}

const MAX_BODY_LENGTH = 256 * 1024;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "仅接受 application/json 请求" }, { status: 415, headers: NO_STORE });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "拒绝跨站写入请求" }, { status: 403, headers: NO_STORE });
      }
    } catch {
      return NextResponse.json({ error: "非法请求来源" }, { status: 403, headers: NO_STORE });
    }
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: "配置体积过大" }, { status: 413, headers: NO_STORE });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400, headers: NO_STORE });
  }

  const issues = validateConfigInput(payload);
  if (issues.length > 0) {
    return NextResponse.json({ error: "配置校验失败，请修正后再保存", issues }, { status: 422, headers: NO_STORE });
  }

  try {
    const saved = await saveConfig(payload);
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (cause) {
    console.error("[api/config] 写入配置失败", cause);
    return NextResponse.json({ error: "写入配置失败，请检查 data 目录权限" }, { status: 500, headers: NO_STORE });
  }
}
