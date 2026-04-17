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
  zipCode?: string | null;
};

const NATIONAL_DEFAULT: RegionalCostModel = {
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

const CALIFORNIA: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "ca-state",
  label: "California",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.22,
  typicalLotSqft: 6500,
  retainingWallPerLinearFoot: { low: 180, high: 420, target: 290 },
  paverWalkwayPerSqft: { low: 24, high: 48, target: 35 },
  patioPerSqft: { low: 30, high: 58, target: 44 },
  gradingPerSqft: { low: 6, high: 14, target: 10 },
  landscapingAllowance: { low: 2200, high: 6500, target: 3800 },
  irrigationAllowance: { low: 1800, high: 5200, target: 3100 },
  firePitAllowance: { low: 2200, high: 5200, target: 3400 },
  fencePerLinearFoot: { low: 36, high: 95, target: 58 },
  deckPerSqft: { low: 45, high: 120, target: 78 },
  cleaningPerSqft: { low: 0.18, high: 0.4, target: 0.28 },
  demolitionAllowance: { low: 700, high: 5200, target: 2200 },
  outdoorLivingAllowance: { low: 8000, high: 28000, target: 15500 }
};

const TEXAS: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "tx-state",
  label: "Texas",
  costTier: "NATIONAL_DEFAULT",
  regionalMultiplier: 1.08,
  typicalLotSqft: 8200,
  retainingWallPerLinearFoot: { low: 140, high: 320, target: 220 },
  paverWalkwayPerSqft: { low: 18, high: 34, target: 27 },
  patioPerSqft: { low: 22, high: 44, target: 33 },
  gradingPerSqft: { low: 4, high: 11, target: 7 },
  landscapingAllowance: { low: 1400, high: 4600, target: 2500 },
  irrigationAllowance: { low: 1000, high: 3200, target: 1800 },
  firePitAllowance: { low: 1400, high: 3600, target: 2300 },
  fencePerLinearFoot: { low: 24, high: 64, target: 40 },
  deckPerSqft: { low: 32, high: 78, target: 52 },
  cleaningPerSqft: { low: 0.14, high: 0.3, target: 0.21 },
  demolitionAllowance: { low: 450, high: 3200, target: 1300 },
  outdoorLivingAllowance: { low: 5000, high: 18000, target: 9500 }
};

const FLORIDA: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "fl-state",
  label: "Florida",
  costTier: "NATIONAL_DEFAULT",
  regionalMultiplier: 1.12,
  typicalLotSqft: 7800,
  retainingWallPerLinearFoot: { low: 150, high: 330, target: 235 },
  paverWalkwayPerSqft: { low: 20, high: 38, target: 29 },
  patioPerSqft: { low: 24, high: 46, target: 35 },
  gradingPerSqft: { low: 5, high: 11, target: 7.5 },
  landscapingAllowance: { low: 1600, high: 5200, target: 2850 },
  irrigationAllowance: { low: 1300, high: 3600, target: 2100 },
  firePitAllowance: { low: 1500, high: 3800, target: 2450 },
  fencePerLinearFoot: { low: 26, high: 68, target: 43 },
  deckPerSqft: { low: 34, high: 86, target: 56 },
  cleaningPerSqft: { low: 0.16, high: 0.34, target: 0.24 },
  demolitionAllowance: { low: 500, high: 3600, target: 1450 },
  outdoorLivingAllowance: { low: 5800, high: 19000, target: 10500 }
};

const MASSACHUSETTS: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "ma-state",
  label: "Massachusetts",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.17,
  typicalLotSqft: 6800,
  retainingWallPerLinearFoot: { low: 170, high: 390, target: 270 },
  paverWalkwayPerSqft: { low: 22, high: 44, target: 33 },
  patioPerSqft: { low: 28, high: 54, target: 41 },
  gradingPerSqft: { low: 5, high: 13, target: 9 },
  landscapingAllowance: { low: 2000, high: 6200, target: 3550 },
  irrigationAllowance: { low: 1500, high: 4300, target: 2550 },
  firePitAllowance: { low: 1900, high: 4600, target: 3000 },
  fencePerLinearFoot: { low: 32, high: 82, target: 52 },
  deckPerSqft: { low: 42, high: 108, target: 70 },
  cleaningPerSqft: { low: 0.17, high: 0.37, target: 0.26 },
  demolitionAllowance: { low: 650, high: 4500, target: 1900 },
  outdoorLivingAllowance: { low: 7000, high: 24000, target: 13200 }
};

const LOS_ANGELES: RegionalCostModel = {
  ...CALIFORNIA,
  key: "los-angeles-ca",
  label: "Los Angeles, CA",
  costTier: "HIGH_COST",
  regionalMultiplier: 1.4,
  typicalLotSqft: 5800,
  minimumJobPrice: 350,
  retainingWallPerLinearFoot: { low: 220, high: 480, target: 330 },
  paverWalkwayPerSqft: { low: 28, high: 54, target: 39 },
  patioPerSqft: { low: 34, high: 64, target: 48 },
  gradingPerSqft: { low: 7, high: 16, target: 11 },
  landscapingAllowance: { low: 2600, high: 7200, target: 4300 },
  irrigationAllowance: { low: 2200, high: 5800, target: 3600 },
  firePitAllowance: { low: 2600, high: 6000, target: 3900 },
  fencePerLinearFoot: { low: 40, high: 105, target: 64 },
  deckPerSqft: { low: 52, high: 130, target: 84 },
  cleaningPerSqft: { low: 0.2, high: 0.42, target: 0.3 },
  demolitionAllowance: { low: 900, high: 5800, target: 2500 },
  outdoorLivingAllowance: { low: 9000, high: 32000, target: 18000 }
};

const SAN_FRANCISCO: RegionalCostModel = {
  ...CALIFORNIA,
  key: "san-francisco-ca",
  label: "San Francisco, CA",
  costTier: "HIGH_COST",
  regionalMultiplier: 1.42,
  typicalLotSqft: 4200
};

const SEATTLE: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "seattle-wa",
  label: "Seattle, WA",
  costTier: "HIGH_COST",
  regionalMultiplier: 1.36,
  typicalLotSqft: 5000
};

const AUSTIN: RegionalCostModel = {
  ...TEXAS,
  key: "austin-tx",
  label: "Austin, TX",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.2,
  typicalLotSqft: 7600
};

const DENVER: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "denver-co",
  label: "Denver, CO",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.18,
  typicalLotSqft: 7000
};

const PHOENIX: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "phoenix-az",
  label: "Phoenix, AZ",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.17,
  typicalLotSqft: 7900
};

const ATLANTA: RegionalCostModel = {
  ...NATIONAL_DEFAULT,
  key: "atlanta-ga",
  label: "Atlanta, GA",
  costTier: "MEDIUM_COST",
  regionalMultiplier: 1.16,
  typicalLotSqft: 8400
};

const CITY_MODELS: Record<string, RegionalCostModel> = {
  "los angeles,ca": LOS_ANGELES,
  "manhattan beach,ca": LOS_ANGELES,
  "santa monica,ca": LOS_ANGELES,
  "san francisco,ca": SAN_FRANCISCO,
  "seattle,wa": SEATTLE,
  "austin,tx": AUSTIN,
  "denver,co": DENVER,
  "phoenix,az": PHOENIX,
  "atlanta,ga": ATLANTA
};

const STATE_MODELS: Record<string, RegionalCostModel> = {
  CA: CALIFORNIA,
  TX: TEXAS,
  FL: FLORIDA,
  MA: MASSACHUSETTS
};

const STATE_ABBREVIATION_MAP: Record<string, string> = {
  california: "CA",
  texas: "TX",
  florida: "FL",
  massachusetts: "MA",
  washington: "WA",
  arizona: "AZ",
  colorado: "CO",
  georgia: "GA"
};

function normalizeCity(city?: string | null): string | null {
  return city?.trim().toLowerCase() ?? null;
}

function normalizeState(state?: string | null): string | null {
  const raw = state?.trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBREVIATION_MAP[raw.toLowerCase()] ?? raw.toUpperCase();
}

export function resolveRegionalCostModel(region: RegionLookup): RegionalCostModel {
  const cityKey = region.city && region.state ? `${normalizeCity(region.city)},${normalizeState(region.state)}` : null;

  if (cityKey && CITY_MODELS[cityKey]) {
    return CITY_MODELS[cityKey];
  }

  if (normalizeState(region.state) === "CA" && region.zipCode?.startsWith("900")) {
    return LOS_ANGELES;
  }

  if (normalizeState(region.state) === "CA" && region.zipCode?.startsWith("941")) {
    return SAN_FRANCISCO;
  }

  if (normalizeState(region.state) === "WA" && region.zipCode?.startsWith("981")) {
    return SEATTLE;
  }

  if (normalizeState(region.state) === "TX" && region.zipCode?.startsWith("787")) {
    return AUSTIN;
  }

  const stateKey = normalizeState(region.state);
  if (stateKey && STATE_MODELS[stateKey]) {
    return STATE_MODELS[stateKey];
  }

  return NATIONAL_DEFAULT;
}

export const TRAVEL_DISTANCE_CAP_MILES = 200;

export function getTravelAdjustmentPct(distanceMiles: number | null | undefined): number {
  if (distanceMiles == null || distanceMiles <= 10) return 0;
  const capped = Math.min(distanceMiles, TRAVEL_DISTANCE_CAP_MILES);
  if (capped <= 25) return 0.05;
  if (capped <= 50) return 0.1;
  return 0.15;
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
