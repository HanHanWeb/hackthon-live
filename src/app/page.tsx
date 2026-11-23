import { LiveConfigHost } from "@/components/display/LiveConfigHost";
import { DEFAULT_CONFIG } from "@/lib/config";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hackathon Live · 活动大屏",
};

export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  let config = DEFAULT_CONFIG;
  try {
    config = await getConfig();
  } catch {
    // 配置文件损坏时降级展示默认配置，避免大屏白屏 500
  }
  return <LiveConfigHost config={config} isPreview={params.preview === "1"} />;
}
