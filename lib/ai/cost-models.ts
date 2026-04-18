export type CostRange = {
  low: number;
  high: number;
  target: number;
};

export type AllowanceRange = {
  low: number;
  high: number;
  target: number;
};

export type RegionalCostModel = {
  key: string;
  label: string;
  costTier: "HIGH_COST" | "MEDIUM_COST" | "NATIONAL_DEFAULT";
  regionalMultiplier: number;
  typicalLotSqft: number;
  minimumJobPrice: number;
  retainingWallPerLinearFoot: CostRange;
  paverWalkwayPerSqft: CostRange;
  patioPerSqft: CostRange;
  gradingPerSqft: CostRange;
  landscapingAllowance: AllowanceRange;
  irrigationAllowance: AllowanceRange;
  firePitAllowance: AllowanceRange;
  fencePerLinearFoot: CostRange;
  deckPerSqft: CostRange;
  cleaningPerSqft: CostRange;
  demolitionAllowance: AllowanceRange;
  outdoorLivingAllowance: AllowanceRange;
};

export type RegionLookup = {
  city?: string | null;
  state?: string | null;
  // Deprecated — kept on the shape so existing callers can still pass it without a TS error.
  // The new resolver ignores ZIP code entirely.
  zipCode?: string | null;
};

export const NATIONAL_DEFAULT: RegionalCostModel = {
  key: "national-default",
  label: "National Default",
  costTier: "NATIONAL_DEFAULT",
  regionalMultiplier: 1,
  typicalLotSqft: 7200,
  minimumJobPrice: 300,
  retainingWallPerLinearFoot: { low: 150, high: 350, target: 240 },
  paverWalkwayPerSqft: { low: 20, high: 40, target: 30 },
  patioPerSqft: { low: 25, high: 50, target: 38 },
  gradingPerSqft: { low: 5, high: 12, target: 8 },
  landscapingAllowance: { low: 1500, high: 5000, target: 2800 },
  irrigationAllowance: { low: 1200, high: 4000, target: 2200 },
  firePitAllowance: { low: 1500, high: 4000, target: 2600 },
  fencePerLinearFoot: { low: 28, high: 75, target: 46 },
  deckPerSqft: { low: 35, high: 90, target: 58 },
  cleaningPerSqft: { low: 0.15, high: 0.35, target: 0.24 },
  demolitionAllowance: { low: 500, high: 4000, target: 1600 },
  outdoorLivingAllowance: { low: 6000, high: 20000, target: 11000 }
};

function stateModel(key: string, label: string, regionalMultiplier: number): RegionalCostModel {
  const costTier: RegionalCostModel["costTier"] =
    regionalMultiplier >= 1.2 ? "HIGH_COST" : regionalMultiplier >= 1.1 ? "MEDIUM_COST" : "NATIONAL_DEFAULT";
  return { ...NATIONAL_DEFAULT, key, label, costTier, regionalMultiplier };
}

function cityModel(key: string, label: string, regionalMultiplier: number): RegionalCostModel {
  const costTier: RegionalCostModel["costTier"] =
    regionalMultiplier >= 1.2 ? "HIGH_COST" : regionalMultiplier >= 1.1 ? "MEDIUM_COST" : "NATIONAL_DEFAULT";
  return { ...NATIONAL_DEFAULT, key, label, costTier, regionalMultiplier };
}

const STATE_MODELS: Record<string, RegionalCostModel> = {
  AK: stateModel("ak-state", "Alaska", 1.25),
  CA: stateModel("ca-state", "California", 1.15),
  CT: stateModel("ct-state", "Connecticut", 1.18),
  DE: stateModel("de-state", "Delaware", 1.05),
  DC: stateModel("dc-state", "District of Columbia", 1.02),
  HI: stateModel("hi-state", "Hawaii", 1.2),
  IL: stateModel("il-state", "Illinois", 1.1),
  MA: stateModel("ma-state", "Massachusetts", 1.18),
  MI: stateModel("mi-state", "Michigan", 1.03),
  MN: stateModel("mn-state", "Minnesota", 1.06),
  NJ: stateModel("nj-state", "New Jersey", 1.11),
  NY: stateModel("ny-state", "New York", 1.18),
  OR: stateModel("or-state", "Oregon", 1.08),
  PA: stateModel("pa-state", "Pennsylvania", 1.0),
  RI: stateModel("ri-state", "Rhode Island", 1.07),
  WA: stateModel("wa-state", "Washington", 1.05)
};

const CITY_MODELS: Record<string, RegionalCostModel> = {
  "anchorage,AK": cityModel("anchorage-ak", "Anchorage, AK", 1.2),
  "los angeles,CA": cityModel("los-angeles-ca", "Los Angeles, CA", 1.15),
  "san diego,CA": cityModel("san-diego-ca", "San Diego, CA", 1.18),
  "san francisco,CA": cityModel("san-francisco-ca", "San Francisco, CA", 1.3),
  "san jose,CA": cityModel("san-jose-ca", "San Jose, CA", 1.27),
  "oakland,CA": cityModel("oakland-ca", "Oakland, CA", 1.3),
  "berkeley,CA": cityModel("berkeley-ca", "Berkeley, CA", 1.3),
  "palo alto,CA": cityModel("palo-alto-ca", "Palo Alto, CA", 1.27),
  "mountain view,CA": cityModel("mountain-view-ca", "Mountain View, CA", 1.27),
  "sunnyvale,CA": cityModel("sunnyvale-ca", "Sunnyvale, CA", 1.27),
  "santa clara,CA": cityModel("santa-clara-ca", "Santa Clara, CA", 1.27),
  "bridgeport,CT": cityModel("bridgeport-ct", "Bridgeport, CT", 1.18),
  "wilmington,DE": cityModel("wilmington-de", "Wilmington, DE", 1.07),
  "washington,DC": cityModel("washington-dc", "Washington, DC", 1.02),
  "honolulu,HI": cityModel("honolulu-hi", "Honolulu, HI", 1.25),
  "chicago,IL": cityModel("chicago-il", "Chicago, IL", 1.17),
  "indianapolis,IN": cityModel("indianapolis-in", "Indianapolis, IN", 1.0),
  "boston,MA": cityModel("boston-ma", "Boston, MA", 1.2),
  "detroit,MI": cityModel("detroit-mi", "Detroit, MI", 1.08),
  "minneapolis,MN": cityModel("minneapolis-mn", "Minneapolis, MN", 1.1),
  "las vegas,NV": cityModel("las-vegas-nv", "Las Vegas, NV", 1.05),
  "newark,NJ": cityModel("newark-nj", "Newark, NJ", 1.14),
  "new york,NY": cityModel("new-york-city-ny", "New York City, NY", 1.38),
  "new york city,NY": cityModel("new-york-city-ny", "New York City, NY", 1.38),
  "brooklyn,NY": cityModel("brooklyn-ny", "Brooklyn, NY", 1.38),
  "queens,NY": cityModel("queens-ny", "Queens, NY", 1.38),
  "manhattan,NY": cityModel("manhattan-ny", "Manhattan, NY", 1.38),
  "bronx,NY": cityModel("bronx-ny", "Bronx, NY", 1.35),
  "portland,OR": cityModel("portland-or", "Portland, OR", 1.1),
  "philadelphia,PA": cityModel("philadelphia-pa", "Philadelphia, PA", 1.05),
  "pittsburgh,PA": cityModel("pittsburgh-pa", "Pittsburgh, PA", 1.06),
  "providence,RI": cityModel("providence-ri", "Providence, RI", 1.1),
  "nashville,TN": cityModel("nashville-tn", "Nashville, TN", 1.0),
  "austin,TX": cityModel("austin-tx", "Austin, TX", 1.0),
  "dallas,TX": cityModel("dallas-tx", "Dallas, TX", 1.0),
  "houston,TX": cityModel("houston-tx", "Houston, TX", 1.0),
  "seattle,WA": cityModel("seattle-wa", "Seattle, WA", 1.12),
  "milwaukee,WI": cityModel("milwaukee-wi", "Milwaukee, WI", 1.05)
};

const STATE_ABBREVIATION_MAP: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};

function normalizeCity(city?: string | null): string | null {
  const raw = city?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : null;
}

function normalizeState(state?: string | null): string | null {
  const raw = state?.trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBREVIATION_MAP[raw.toLowerCase()] ?? raw.toUpperCase();
}

export function resolveRegionalCostModel(region: RegionLookup): RegionalCostModel {
  const city = normalizeCity(region.city);
  const state = normalizeState(region.state);

  if (city && state) {
    const cityKey = `${city},${state}`;
    const cityMatch = CITY_MODELS[cityKey];
    if (cityMatch) return cityMatch;
  }

  if (state && STATE_MODELS[state]) {
    return STATE_MODELS[state];
  }

  return NATIONAL_DEFAULT;
}

export const TRAVEL_DISTANCE_CAP_MILES = 200;
const TRAVEL_DOLLARS_PER_MILE = 2.5;
const TRAVEL_FREE_MILES = 10;

/**
 * Per-mile travel cost scaled by region. Returns a dollar addend (not a multiplier).
 *
 *   travelCost = miles × $2.50 × regionalMultiplier
 *
 * - No charge under 10 miles.
 * - Miles above the 200-mile cap use the 200-mile rate.
 */
export function computeTravelCost(
  distanceMiles: number | null | undefined,
  regionalMultiplier: number
): number {
  if (distanceMiles == null || distanceMiles <= TRAVEL_FREE_MILES) return 0;
  const capped = Math.min(distanceMiles, TRAVEL_DISTANCE_CAP_MILES);
  return capped * TRAVEL_DOLLARS_PER_MILE * regionalMultiplier;
}

export function getTerrainAdjustmentPct(terrain: string | null | undefined): number {
  switch (terrain) {
    case "mild_slope":
      return 0.05;
    case "moderate_slope":
      return 0.15;
    case "steep_slope":
      return 0.25;
    default:
      return 0;
  }
}

export function getAccessAdjustmentPct(access: string | null | undefined): number {
  switch (access) {
    case "limited_side_yard_access":
      return 0.1;
    case "backyard_only":
      return 0.2;
    case "difficult_no_equipment_access":
      return 0.3;
    default:
      return 0;
  }
}

export function getMaterialTierMultiplier(materialTier: string | null | undefined): number {
  switch (materialTier) {
    case "basic":
      return 0.94;
    case "premium":
      return 1.14;
    default:
      return 1;
  }
}
