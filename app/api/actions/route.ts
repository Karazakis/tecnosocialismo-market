import { categories, contributionAreas, isEdibleCategory, normalizeItem } from "@/lib/catalog";
import { getSuiteUser } from "@/lib/auth";
import {
  safeNumber,
  safeStringList,
  safeText,
  type Cadence,
  type CapacityOffer,
  type ConsumptionNeed,
  type EconomicProfile,
  type Listing,
  type ListingMode,
  type NeedPriority,
} from "@/lib/model";
import { demandRegistry, findListing, getProfile, requestListing, saveListing, saveProfile } from "@/lib/store";

const categoryIds = new Set(categories.map((category) => category.id));
const contributionIds = new Set(contributionAreas.map((area) => area.id));
const cadenceIds = new Set<Cadence>(["una-volta", "settimanale", "mensile", "trimestrale", "annuale"]);
const priorityIds = new Set<NeedPriority>(["essenziale", "importante", "utile"]);
const unitIds = new Set(["pezzi", "kg", "g", "litri", "confezioni", "ore"]);

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Archivio non configurato." }, { status: 503 });
  }

  const user = await getSuiteUser(new Headers(request.headers));
  if (!user) return Response.json({ error: "Accedi con l'account unico per continuare." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = safeText(body?.action, 60);
  const now = new Date().toISOString();

  if (action === "save-profile") {
    const needs = parseNeeds(body?.needs);
    if (!needs.length) return fail("Indica almeno un bene, alimento o bevanda di cui hai bisogno.");

    const current = await getProfile(user.id);
    const profile: EconomicProfile = {
      id: user.id,
      name: user.name,
      city: safeText(body?.city, 80),
      postalCode: safeText(body?.postalCode, 12),
      householdSize: safeNumber(body?.householdSize, 1, 20, 1),
      radiusKm: safeNumber(body?.radiusKm, 1, 200, 15),
      needs,
      capacities: parseCapacities(body?.capacities),
      contributionAreas: safeStringList(body?.contributionAreas, 20).filter((id) => contributionIds.has(id)),
      contributionHours: safeNumber(body?.contributionHours, 0, 80, 0),
      availability: safeText(body?.availability, 240),
      mobility:
        body?.mobility === "piedi-bici" || body?.mobility === "mezzo-leggero" || body?.mobility === "auto-furgone"
          ? body.mobility
          : "nessuna",
      canDeliver: body?.canDeliver === true,
      learningInterests: safeStringList(body?.learningInterests, 12),
      profileVersion: 2,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (!profile.city || !profile.postalCode) return fail("Indica città e CAP per calcolare la rete territoriale.");
    await saveProfile(profile);
    return Response.json({ profile });
  }

  const profile = await getProfile(user.id);
  if (!profile) {
    return Response.json({ error: "Completa prima il profilo economico personale." }, { status: 409 });
  }

  if (action === "create-listing") {
    const category = safeText(body?.category, 60);
    const categoryDefinition = categories.find((item) => item.id === category);
    if (!categoryDefinition) return fail("Categoria non valida.");

    const item = safeText(body?.item, 120);
    const normalized = normalizeItem(item);
    const demand = await demandRegistry();
    const requested = demand.some(
      (entry) => entry.category === category && normalizeItem(entry.item) === normalized && entry.people > 0,
    );
    if (!requested) {
      return fail(
        "Questo bene non compare ancora nella domanda collettiva. Deve essere indicato prima nel profilo economico di almeno una persona.",
        403,
      );
    }

    const vegan = body?.vegan === true;
    if (isEdibleCategory(category) && !vegan) {
      return fail("Nel Market cibo e bevande devono essere esclusivamente vegani.", 403);
    }

    const mode = (["dono", "scambio", "vendita"].includes(String(body?.mode))
      ? body?.mode
      : "dono") as ListingMode;
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
      mode,
      marketPrice,
      askingPrice: mode === "vendita" ? safeNumber(body?.askingPrice, 0, 1_000_000, 0) : undefined,
      exchangeFor: mode === "scambio" ? safeText(body?.exchangeFor, 160) : undefined,
      city,
      pickup: body?.pickup !== false,
      internalDelivery: body?.internalDelivery === true,
      status: "disponibile",
      createdAt: now,
    };
    if (mode === "vendita" && (!listing.askingPrice || listing.askingPrice <= 0)) {
      return fail("Indica il prezzo richiesto per la vendita.");
    }
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
    if (!requestedByPerson) {
      return fail("Per richiedere questo bene, aggiungilo prima ai tuoi bisogni nel profilo economico.", 403);
    }

    const marketRequest = await requestListing(listing, {
      userId: user.id,
      userName: user.name,
      message: safeText(body?.message, 700) || "Sono interessato a questo bene.",
      deliveryRequested: body?.deliveryRequested === true,
    });
    return Response.json({ request: marketRequest }, { status: 201 });
  }

  return fail("Azione non riconosciuta.", 400);
}

function parseNeeds(value: unknown): ConsumptionNeed[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const category = safeText(item.category, 60);
      const name = safeText(item.item, 120);
      const key = `${category}|${normalizeItem(name)}`;
      if (!categoryIds.has(category) || !name || unique.has(key)) return [];
      unique.add(key);
      return [
        {
          id: safeText(item.id, 80) || crypto.randomUUID(),
          category,
          item: name,
          quantity: safeNumber(item.quantity, 0.01, 100_000, 1),
          unit: unitIds.has(String(item.unit)) ? String(item.unit) : "pezzi",
          cadence: cadenceIds.has(item.cadence as Cadence) ? (item.cadence as Cadence) : "mensile",
          priority: priorityIds.has(item.priority as NeedPriority)
            ? (item.priority as NeedPriority)
            : "importante",
          alternatives: safeText(item.alternatives, 240),
          notes: safeText(item.notes, 320),
        },
      ];
    })
    .slice(0, 60);
}

function parseCapacities(value: unknown): CapacityOffer[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const category = safeText(item.category, 60);
      const activity = safeText(item.activity, 120);
      if (!categoryIds.has(category) || !activity) return [];
      return [
        {
          id: safeText(item.id, 80) || crypto.randomUUID(),
          category,
          activity,
          capacity: safeNumber(item.capacity, 0.01, 100_000, 1),
          unit: unitIds.has(String(item.unit)) ? String(item.unit) : "pezzi",
          cadence: cadenceIds.has(item.cadence as Cadence) ? (item.cadence as Cadence) : "mensile",
          experience: (
            item.experience === "iniziale" || item.experience === "esperta" ? item.experience : "autonoma"
          ) as CapacityOffer["experience"],
          resources: safeText(item.resources, 320),
          availability: safeText(item.availability, 240),
        },
      ];
    })
    .slice(0, 40);
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
