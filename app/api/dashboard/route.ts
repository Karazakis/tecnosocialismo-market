import { getSuiteUser } from "@/lib/auth";
import { loadMarket } from "@/lib/store";

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
    });
  }

  const user = await getSuiteUser(new Headers(request.headers));
  const data = await loadMarket(user?.id);
  return Response.json(
    { configured: true, viewerId: user?.id ?? null, ...data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
