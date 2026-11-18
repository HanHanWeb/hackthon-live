import { AdminConsole } from "@/components/admin/AdminConsole";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "后台 · Hackathon Live",
};

export default async function AdminPage() {
  const config = await getConfig();
  return <AdminConsole initialConfig={config} />;
}
