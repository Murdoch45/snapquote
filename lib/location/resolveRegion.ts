import type { PricingRegionKey as Region } from "@/estimators/shared";

export type GoogleAddress = {
  formattedAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

const REGION_MAP: Partial<Record<string, Region>> = {
  CA: "los_angeles",
  NY: "new_york",
  IL: "chicago",
  FL: "miami",
  MA: "new_york"
};

const STATE_MAP: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  "New York": "NY",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Washington: "WA",
  Colorado: "CO",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY"
};

const BAY_AREA_MATCHERS = [
  "san francisco",
  "oakland",
  "berkeley",
  "san jose",
  "palo alto",
  "mountain view",
  "sunnyvale",
  "fremont",
  "marin",
  "sausalito",
  "mill valley",
  "san mateo",
  "redwood city",
  "menlo park",
  "walnut creek",
  "alameda"
];

export function resolveRegion(googleAddress: GoogleAddress): Region {
  const rawState = googleAddress.state?.trim() ?? "";
  const rawCity = googleAddress.city?.trim() ?? "";
  const city = rawCity.toLowerCase();
  const normalizedState = (STATE_MAP[rawState] ?? rawState).toUpperCase();
  const formattedAddress = googleAddress.formattedAddress?.trim().toLowerCase() ?? "";
  const locationText = `${city} ${formattedAddress}`;

  if (!normalizedState) return "default";

  if (normalizedState === "CA") {
    if (BAY_AREA_MATCHERS.some((matcher) => locationText.includes(matcher))) {
      return "san_francisco";
    }

    return "los_angeles";
  }

  const resolvedRegion = REGION_MAP[normalizedState] ?? "default";
  return resolvedRegion;
}
