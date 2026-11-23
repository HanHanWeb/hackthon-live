import { AdminConsole } from "@/components/admin/AdminConsole";
import { DEFAULT_CONFIG } from "@/lib/config";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "后台 · Hackathon Live",
};

export default async function AdminPage() {
  let config = DEFAULT_CONFIG;
  let loadError: string | undefined;
  try {
    config = await getConfig();
  } catch {
    loadError = "读取配置文件失败（可能已损坏或无权限），当前显示默认配置，保存后将覆盖修复原文件。";
  }
  return <AdminConsole initialConfig={config} loadError={loadError} />;
}
