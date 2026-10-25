import { ConnectionGate } from "@/components/ConnectionGate";
import { listEnabledModules } from "@/lib/app-modules";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();
  const initialUser = user
    ? { ...user, enabledModules: listEnabledModules(user.role) }
    : null;
  return <ConnectionGate initialUser={initialUser} />;
}
