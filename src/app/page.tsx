import { LiveConfigHost } from "@/components/display/LiveConfigHost";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hackathon Live · 活动大屏",
};

export default async function DisplayPage() {
  const config = await getConfig();
  return <LiveConfigHost config={config} serverTime={Date.now()} />;
}
