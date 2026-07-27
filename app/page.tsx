import { headers } from "next/headers";
import { getSuiteUser } from "@/lib/auth";
import { MarketApp } from "./market-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSuiteUser(await headers());
  return <MarketApp user={user} />;
}
