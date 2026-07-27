import type { ProductGroup } from "./catalog";

export type Cadence = "una-volta" | "settimanale" | "mensile" | "trimestrale" | "annuale";
export type NeedPriority = "essenziale" | "importante" | "utile";
export type ListingMode = "dono" | "scambio" | "vendita";
export type ListingStatus = "disponibile" | "riservato" | "concluso";

export type ConsumptionNeed = {
  id: string;
  category: string;
  item: string;
  quantity: number;
  unit: string;
  cadence: Cadence;
  priority: NeedPriority;
  alternatives: string;
  notes: string;
};

export type CapacityOffer = {
  id: string;
  category: string;
  activity: string;
  capacity: number;
  unit: string;
  cadence: Cadence;
  experience: "iniziale" | "autonoma" | "esperta";
  resources: string;
  availability: string;
};

export type EconomicProfile = {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  householdSize: number;
  radiusKm: number;
  needs: ConsumptionNeed[];
  capacities: CapacityOffer[];
  contributionAreas: string[];
  contributionHours: number;
  availability: string;
  mobility: "nessuna" | "piedi-bici" | "mezzo-leggero" | "auto-furgone";
  canDeliver: boolean;
  learningInterests: string[];
  profileVersion: 2;
  createdAt: string;
  updatedAt: string;
};

export type DemandEntry = {
  key: string;
  category: string;
  item: string;
  people: number;
  totalQuantity: number;
  unit: string;
  cadence: Cadence;
  essentialCount: number;
};

export type SupplyEntry = {
  key: string;
  category: string;
  activity: string;
  people: number;
  totalCapacity: number;
  unit: string;
  cadence: Cadence;
};

export type Listing = {
  id: string;
  ownerId: string;
  ownerName: string;
  category: string;
  group: ProductGroup;
  item: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  condition: string;
  vegan: boolean;
  mode: ListingMode;
  marketPrice: number;
  askingPrice?: number;
  exchangeFor?: string;
  city: string;
  pickup: boolean;
  internalDelivery: boolean;
  status: ListingStatus;
  createdAt: string;
};

export type MarketRequest = {
  id: string;
  listingId: string;
  listingTitle: string;
  requesterId: string;
  requesterName: string;
  ownerId: string;
  mode: ListingMode;
  message: string;
  deliveryRequested: boolean;
  status: "inviata" | "accettata" | "rifiutata" | "conclusa";
  createdAt: string;
};

export type MarketDashboard = {
  configured: boolean;
  viewerId: string | null;
  profile: EconomicProfile | null;
  demand: DemandEntry[];
  supply: SupplyEntry[];
  listings: Listing[];
  requests: MarketRequest[];
};

export function safeText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function safeNumber(value: unknown, min: number, max: number, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function safeStringList(value: unknown, max = 20) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 120)] : [])).slice(0, max)
    : [];
}
