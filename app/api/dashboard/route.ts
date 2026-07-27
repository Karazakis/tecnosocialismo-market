import { getSuiteUser } from "@/lib/auth";
import { loadMarket } from "@/lib/store";
import { getCentralDemand, getCentralEconomicProfile } from "@/lib/central-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({
      configured: false,
      viewerId: null,
      profile: null,
      demand: [],
      supply: [],
      listings: [],
      requests: [],
      orders: [],
    });
  }

  const requestHeaders = new Headers(request.headers);
  const user = await getSuiteUser(requestHeaders);
  const [data, demand, profile] = await Promise.all([
    loadMarket(user?.id),
    getCentralDemand(),
    user ? getCentralEconomicProfile(requestHeaders, user) : Promise.resolve(null),
  ]);
  return Response.json(
    { configured: true, viewerId: user?.id ?? null, profile, demand, supply: [], ...data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
