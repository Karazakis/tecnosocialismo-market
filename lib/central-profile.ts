import { normalizeItem } from "./catalog";
import type { DemandEntry, EconomicProfile } from "./model";

const AUTH_ORIGIN = process.env.AUTH_ORIGIN ?? "https://login.tecnosocialismo.com";

type CentralPreference = {
  id: string;
  domain: "goods" | "services" | "work" | "leisure" | "education";
  category: string;
  item: string;
  quantity: number;
  unit: string;
  cadence: EconomicProfile["needs"][number]["cadence"];
  priority: EconomicProfile["needs"][number]["priority"];
  enabled: boolean;
  notes: string;
};

type CentralProfile = {
  city: string;
  postalCode: string;
  householdSize: number;
  radiusKm: number;
  basket: CentralPreference[];
  work: { skills: string[]; learningGoals: string[] };
  contribution: {
    areas: string[];
    hoursPerWeek: number;
    availability: string;
    mobility: EconomicProfile["mobility"];
    canDeliver: boolean;
    productiveActivities: string[];
    resources: string[];
  };
  updatedAt: string;
};

export async function getCentralEconomicProfile(requestHeaders: Headers, user: { id: string; name: string }): Promise<EconomicProfile | null> {
  const cookie = requestHeaders.get("cookie");
  if (!cookie) return null;
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/economic-profile`, { headers: { cookie }, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { profile?: CentralProfile | null };
    const profile = payload.profile;
    if (!profile) return null;
    return {
      id: user.id,
      name: user.name,
      city: profile.city,
      postalCode: profile.postalCode,
      householdSize: profile.householdSize,
      radiusKm: profile.radiusKm,
      needs: profile.basket.filter((entry) => entry.enabled && entry.domain === "goods").map((entry) => ({
        id: entry.id,
        category: entry.category,
        item: entry.item,
        quantity: entry.quantity,
        unit: entry.unit,
        cadence: entry.cadence,
        priority: entry.priority,
        alternatives: "",
        notes: entry.notes,
      })),
      capacities: profile.contribution.productiveActivities.map((activity, index) => ({
        id: `central-capacity-${index}`,
        category: "casa-cucina",
        activity,
        capacity: Math.max(1, profile.contribution.hoursPerWeek),
        unit: "ore",
        cadence: "settimanale",
        experience: "autonoma",
        resources: profile.contribution.resources.join(", "),
        availability: profile.contribution.availability,
      })),
      contributionAreas: profile.contribution.areas,
      contributionHours: profile.contribution.hoursPerWeek,
      availability: profile.contribution.availability,
      mobility: profile.contribution.mobility,
      canDeliver: profile.contribution.canDeliver,
      learningInterests: profile.work.learningGoals,
      profileVersion: 2,
      createdAt: profile.updatedAt,
      updatedAt: profile.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getCentralDemand(): Promise<DemandEntry[]> {
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/economic-profile/demand`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json() as { demand?: DemandEntry[] };
    return (payload.demand ?? []).filter((entry) => normalizeItem(entry.item) && entry.people > 0);
  } catch {
    return [];
  }
}
