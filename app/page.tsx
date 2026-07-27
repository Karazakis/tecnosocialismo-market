import { headers } from "next/headers";
import { getSuiteUser } from "@/lib/auth";
import { MarketV2 } from "./market-v2";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSuiteUser(await headers());
  return <MarketV2 user={user} />;
}
