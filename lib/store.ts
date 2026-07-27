import { get, list, put } from "@vercel/blob";
import type { Listing, MarketOrder, MarketRequest } from "./model";

const PREFIX = {
  listings: "market-v2/listings/",
  requests: "market-v2/requests/",
  orders: "market-v2/orders/",
};
export async function loadMarket(userId?: string) {
  const [listings, requests, orders] = await Promise.all([
    listRecords<Listing>(PREFIX.listings),
    listRecords<MarketRequest>(PREFIX.requests),
    listRecords<MarketOrder>(PREFIX.orders),
  ]);

  return {
    listings: sortNewest(listings),
    requests: userId
      ? sortNewest(requests.filter((request) => request.requesterId === userId || request.ownerId === userId))
      : [],
    orders: userId ? sortNewest(orders.filter((order) => order.buyerId === userId || order.sellerId === userId)) : [],
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

export async function createOrders(input: {
  buyerId: string;
  buyerName: string;
  items: { listing: Listing; quantity: number }[];
  fulfillment: MarketOrder["fulfillment"];
  address: string;
  deliverySlot: string;
}) {
  const groups = new Map<string, { listing: Listing; quantity: number }[]>();
  for (const item of input.items) {
    const key = item.listing.ownerId;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const orders: MarketOrder[] = [];
  for (const items of groups.values()) {
    const first = items[0].listing;
    const subtotal = items.reduce((sum, item) => sum + (item.listing.askingPrice ?? 0) * item.quantity, 0);
    const marketReferenceTotal = items.reduce((sum, item) => sum + item.listing.marketPrice * item.quantity, 0);
    const maxFee = Math.max(...items.map((item) => item.listing.deliveryFee ?? 0));
    const freeThreshold = Math.max(...items.map((item) => item.listing.freeDeliveryThreshold ?? Number.POSITIVE_INFINITY));
    const deliveryFee = input.fulfillment === "ritiro" || subtotal >= freeThreshold ? 0 : maxFee;
    const order: MarketOrder = {
      id: crypto.randomUUID(),
      buyerId: input.buyerId,
      buyerName: input.buyerName,
      sellerId: first.ownerId,
      sellerName: first.ownerName,
      storeName: first.storeName || first.ownerName,
      lines: items.map((item) => ({ listingId: item.listing.id, title: item.listing.title, quantity: item.quantity, unit: item.listing.unit, unitPrice: item.listing.askingPrice ?? 0, marketUnitPrice: item.listing.marketPrice })),
      subtotal,
      marketReferenceTotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      fulfillment: input.fulfillment,
      address: input.address,
      deliverySlot: input.deliverySlot,
      status: first.productType === "piatto-pronto" ? "in-preparazione" : "richiesto",
      createdAt: new Date().toISOString(),
    };
    orders.push(order);
    await writeJson(`${PREFIX.orders}${order.id}.json`, order, false);
    await Promise.all(items.map(({ listing, quantity }) => {
      const stock = Math.max(0, listing.stock - quantity);
      return writeJson(`${PREFIX.listings}${listing.id}.json`, { ...listing, stock, status: stock > 0 ? "disponibile" : "concluso" }, true);
    }));
  }
  return orders;
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

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
