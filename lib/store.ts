import { get, list, put } from "@vercel/blob";
import { normalizeItem } from "./catalog";
import type { DemandEntry, EconomicProfile, Listing, MarketRequest, SupplyEntry } from "./model";

const PREFIX = {
  profiles: "market-v2/profiles/",
  listings: "market-v2/listings/",
  requests: "market-v2/requests/",
};

export async function getProfile(id: string) {
  return readJson<EconomicProfile>(`${PREFIX.profiles}${safeKey(id)}.json`);
}

export async function saveProfile(profile: EconomicProfile) {
  return writeJson(`${PREFIX.profiles}${safeKey(profile.id)}.json`, profile, true);
}

export async function listProfiles() {
  return listRecords<EconomicProfile>(PREFIX.profiles);
}

export async function demandRegistry(): Promise<DemandEntry[]> {
  const profiles = await listProfiles();
  const map = new Map<string, DemandEntry>();

  for (const profile of profiles) {
    const counted = new Set<string>();
    for (const need of profile.needs) {
      const normalized = normalizeItem(need.item);
      if (!normalized) continue;
      const key = `${need.category}|${normalized}|${need.unit}|${need.cadence}`;
      const current = map.get(key) ?? {
        key,
        category: need.category,
        item: need.item,
        people: 0,
        totalQuantity: 0,
        unit: need.unit,
        cadence: need.cadence,
        essentialCount: 0,
      };
      if (!counted.has(key)) {
        current.people += 1;
        counted.add(key);
      }
      current.totalQuantity += need.quantity;
      if (need.priority === "essenziale") current.essentialCount += 1;
      map.set(key, current);
    }
  }

  return [...map.values()].sort(
    (a, b) => b.essentialCount - a.essentialCount || b.people - a.people || a.item.localeCompare(b.item, "it"),
  );
}

export async function supplyRegistry(): Promise<SupplyEntry[]> {
  const profiles = await listProfiles();
  const map = new Map<string, SupplyEntry>();

  for (const profile of profiles) {
    const counted = new Set<string>();
    for (const capacity of profile.capacities) {
      const normalized = normalizeItem(capacity.activity);
      if (!normalized) continue;
      const key = `${capacity.category}|${normalized}|${capacity.unit}|${capacity.cadence}`;
      const current = map.get(key) ?? {
        key,
        category: capacity.category,
        activity: capacity.activity,
        people: 0,
        totalCapacity: 0,
        unit: capacity.unit,
        cadence: capacity.cadence,
      };
      if (!counted.has(key)) {
        current.people += 1;
        counted.add(key);
      }
      current.totalCapacity += capacity.capacity;
      map.set(key, current);
    }
  }

  return [...map.values()].sort((a, b) => b.people - a.people || a.activity.localeCompare(b.activity, "it"));
}

export async function loadMarket(userId?: string) {
  const [profiles, demand, supply, listings, requests] = await Promise.all([
    listProfiles(),
    demandRegistry(),
    supplyRegistry(),
    listRecords<Listing>(PREFIX.listings),
    listRecords<MarketRequest>(PREFIX.requests),
  ]);

  return {
    profile: userId ? profiles.find((profile) => profile.id === userId) ?? null : null,
    demand,
    supply,
    listings: sortNewest(listings),
    requests: userId
      ? sortNewest(requests.filter((request) => request.requesterId === userId || request.ownerId === userId))
      : [],
  };
}

export async function saveListing(listing: Listing) {
  await writeJson(`${PREFIX.listings}${listing.id}.json`, listing, false);
  return listing;
}

export async function findListing(id: string) {
  return readRecord<Listing>(PREFIX.listings, id);
}

export async function requestListing(
  listing: Listing,
  input: { userId: string; userName: string; message: string; deliveryRequested: boolean },
) {
  const request: MarketRequest = {
    id: crypto.randomUUID(),
    listingId: listing.id,
    listingTitle: listing.title,
    requesterId: input.userId,
    requesterName: input.userName,
    ownerId: listing.ownerId,
    mode: listing.mode,
    message: input.message,
    deliveryRequested: input.deliveryRequested,
    status: "inviata",
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    writeJson(`${PREFIX.requests}${request.id}.json`, request, false),
    writeJson(`${PREFIX.listings}${listing.id}.json`, { ...listing, status: "riservato" }, true),
  ]);
  return request;
}

async function listRecords<T>(prefix: string) {
  const result = await list({ prefix, limit: 1000 });
  const records = await Promise.all(result.blobs.map((blob) => readJson<T>(blob.url)));
  return records.flatMap((record) => (record === null ? [] : [record]));
}

async function readRecord<T>(prefix: string, id: string) {
  return validId(id) ? readJson<T>(`${prefix}${id}.json`) : null;
}

async function writeJson(pathname: string, value: unknown, allowOverwrite: boolean) {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  });
  return value;
}

async function readJson<T>(urlOrPathname: string): Promise<T | null> {
  try {
    const result = await get(urlOrPathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    return null;
  }
}

function sortNewest<T extends { createdAt: string }>(records: T[]) {
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
}

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
