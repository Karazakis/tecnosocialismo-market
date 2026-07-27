import { categories, isEdibleCategory, normalizeItem } from "@/lib/catalog";
import { getSuiteUser } from "@/lib/auth";
import { getCentralDemand, getCentralEconomicProfile } from "@/lib/central-profile";
import { safeNumber, safeText, type Listing, type ListingMode, type MarketOrder } from "@/lib/model";
import { createOrders, findListing, requestListing, saveListing } from "@/lib/store";

const unitIds = new Set(["pezzi", "kg", "g", "litri", "confezioni", "ore"]);

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Archivio non configurato." }, { status: 503 });
  }

  const requestHeaders = new Headers(request.headers);
  const user = await getSuiteUser(requestHeaders);
  if (!user) return Response.json({ error: "Accedi con l'account unico per continuare." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = safeText(body?.action, 60);
  const now = new Date().toISOString();
  const profile = await getCentralEconomicProfile(requestHeaders, user);
  if (!profile) {
    return Response.json({ error: "Completa il paniere generale nel portale Account prima di continuare." }, { status: 409 });
  }

  if (action === "create-listing") {
    const category = safeText(body?.category, 60);
    const categoryDefinition = categories.find((item) => item.id === category);
    if (!categoryDefinition) return fail("Categoria non valida.");

    const item = safeText(body?.item, 120);
    const normalized = normalizeItem(item);
    const demand = await getCentralDemand();
    const requested = demand.some(
      (entry) => entry.category === category && normalizeItem(entry.item) === normalized && entry.people > 0,
    );
    if (!requested) {
      return fail(
        "Questo bene non compare ancora nella domanda collettiva. Deve essere indicato prima nel paniere generale di almeno una persona.",
        403,
      );
    }

    const vegan = body?.vegan === true;
    if (isEdibleCategory(category) && !vegan) {
      return fail("Nel Market cibo e bevande devono essere esclusivamente vegani.", 403);
    }

    const mode = (["dono", "scambio", "vendita"].includes(String(body?.mode)) ? body?.mode : "dono") as ListingMode;
    const marketPrice = safeNumber(body?.marketPrice, 0, 1_000_000, 0);
    if (marketPrice <= 0) return fail("Indica sempre il prezzo di riferimento del mercato capitalista.");

    const title = safeText(body?.title, 120);
    const description = safeText(body?.description, 900);
    const city = safeText(body?.city, 80);
    if (!item || !title || !description || !city) return fail("Completa bene, titolo, descrizione e luogo.");

    const listing: Listing = {
      id: crypto.randomUUID(),
      ownerId: user.id,
      ownerName: user.name,
      category,
      group: categoryDefinition.group,
      item,
      title,
      description,
      quantity: safeNumber(body?.quantity, 0.01, 100_000, 1),
      unit: unitIds.has(String(body?.unit)) ? String(body?.unit) : "pezzi",
      condition: safeText(body?.condition, 80) || (isEdibleCategory(category) ? "Fresco" : "Buono"),
      vegan: isEdibleCategory(category) ? true : vegan,
      productType:
        body?.productType === "piatto-pronto" && isEdibleCategory(category)
          ? "piatto-pronto"
          : isEdibleCategory(category)
            ? "spesa"
            : "bene",
      sellerType:
        body?.sellerType === "negozio" || body?.sellerType === "cooperativa" || body?.sellerType === "ristorazione"
          ? body.sellerType
          : "persona",
      storeName: safeText(body?.storeName, 120) || user.name,
      stock: safeNumber(body?.stock, 1, 100_000, 1),
      mode,
      marketPrice,
      askingPrice: mode === "vendita" ? safeNumber(body?.askingPrice, 0, 1_000_000, 0) : undefined,
      exchangeFor: mode === "scambio" ? safeText(body?.exchangeFor, 160) : undefined,
      city,
      pickup: body?.pickup !== false,
      internalDelivery: body?.internalDelivery === true,
      expressDelivery: body?.expressDelivery === true,
      shippingAvailable: body?.shippingAvailable === true,
      deliveryFee: safeNumber(body?.deliveryFee, 0, 10_000, 0),
      freeDeliveryThreshold: safeNumber(body?.freeDeliveryThreshold, 0, 1_000_000, 0) || undefined,
      preparationMinutes: isEdibleCategory(category) ? safeNumber(body?.preparationMinutes, 0, 1440, 0) || undefined : undefined,
      shippingDaysMin: body?.shippingAvailable === true ? safeNumber(body?.shippingDaysMin, 1, 60, 1) : undefined,
      shippingDaysMax: body?.shippingAvailable === true ? safeNumber(body?.shippingDaysMax, 1, 90, 3) : undefined,
      ingredients: isEdibleCategory(category) ? safeText(body?.ingredients, 1200) : undefined,
      allergens: isEdibleCategory(category) ? safeText(body?.allergens, 500) : undefined,
      status: "disponibile",
      createdAt: now,
    };
    if (mode === "vendita" && (!listing.askingPrice || listing.askingPrice <= 0)) return fail("Indica il prezzo richiesto per la vendita.");
    if (isEdibleCategory(category) && !listing.ingredients) return fail("Per il cibo indica ingredienti e composizione.");
    if (listing.shippingDaysMin && listing.shippingDaysMax && listing.shippingDaysMax < listing.shippingDaysMin) return fail("Controlla i tempi minimi e massimi di spedizione.");
    await saveListing(listing);
    return Response.json({ listing }, { status: 201 });
  }

  if (action === "request-listing") {
    const listing = await findListing(safeText(body?.id, 80));
    if (!listing) return fail("Bene non trovato.", 404);
    if (listing.ownerId === user.id) return fail("Questo bene è già tuo.");
    if (listing.status !== "disponibile") return fail("Il bene non è più disponibile.", 409);

    const requestedByPerson = profile.needs.some(
      (need) => need.category === listing.category && normalizeItem(need.item) === normalizeItem(listing.item),
    );
    if (!requestedByPerson) return fail("Per richiedere questo bene, aggiungilo prima al paniere generale del tuo account.", 403);

    const marketRequest = await requestListing(listing, {
      userId: user.id,
      userName: user.name,
      message: safeText(body?.message, 700) || "Sono interessato a questo bene.",
      deliveryRequested: body?.deliveryRequested === true,
    });
    return Response.json({ request: marketRequest }, { status: 201 });
  }

  if (action === "create-order") {
    if (!Array.isArray(body?.items) || !body.items.length) return fail("Il carrello è vuoto.");
    const requestedItems = body.items.slice(0, 30).flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const id = safeText(item.id, 80);
      return id ? [{ id, quantity: safeNumber(item.quantity, 1, 1000, 1) }] : [];
    });
    const resolved = await Promise.all(requestedItems.map(async (item) => ({ ...item, listing: await findListing(item.id) })));
    if (resolved.some((item) => !item.listing)) return fail("Uno dei prodotti non è più disponibile.", 409);
    const cart = resolved.map((item) => ({ listing: item.listing as Listing, quantity: item.quantity }));
    if (cart.some((item) => item.listing.mode !== "vendita" || item.listing.status !== "disponibile" || item.listing.stock < item.quantity)) return fail("Controlla disponibilità e quantità del carrello.", 409);
    if (cart.some((item) => item.listing.ownerId === user.id)) return fail("Non puoi acquistare i tuoi prodotti.");
    if (cart.some((item) => !profile.needs.some((need) => need.category === item.listing.category && normalizeItem(need.item) === normalizeItem(item.listing.item)))) return fail("Nel carrello c'è un prodotto non presente nel tuo paniere personale.", 403);

    const fulfillment = (
      body?.fulfillment === "ritiro" || body?.fulfillment === "express" || body?.fulfillment === "spedizione"
        ? body.fulfillment
        : "consegna-interna"
    ) as MarketOrder["fulfillment"];
    if (fulfillment === "ritiro" && cart.some((item) => !item.listing.pickup)) return fail("Il ritiro non è disponibile per tutti i prodotti.");
    if (fulfillment === "express" && cart.some((item) => !item.listing.expressDelivery)) return fail("La consegna express non è disponibile per tutti i prodotti.");
    if (fulfillment === "spedizione" && cart.some((item) => !item.listing.shippingAvailable)) return fail("La spedizione non è disponibile per tutti i prodotti.");
    if (fulfillment === "consegna-interna" && cart.some((item) => !item.listing.internalDelivery)) return fail("La consegna interna non è disponibile per tutti i prodotti.");
    const address = safeText(body?.address, 240);
    if (fulfillment !== "ritiro" && !address) return fail("Indica l'indirizzo di consegna.");
    const orders = await createOrders({
      buyerId: user.id,
      buyerName: user.name,
      items: cart,
      fulfillment,
      address,
      deliverySlot: safeText(body?.deliverySlot, 120) || "Prima disponibilità",
    });
    return Response.json({ orders }, { status: 201 });
  }

  return fail("Azione non riconosciuta.", 400);
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
