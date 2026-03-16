import { resolveRegionalCostModel } from "@/lib/ai/cost-models";
import { getGoogleMapsApiKey } from "@/lib/maps";

const SQFT_PER_SQM = 10.7639;

type PropertyLookupInput = {
  address: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  parcelLotSizeSqft?: number | null;
  travelDistanceMiles?: number | null;
};

type AddressContext = {
  formattedAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

export type PropertyData = {
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lotSizeSqft: number | null;
  houseSqft: number | null;
  estimatedBackyardSqft: number | null;
  travelDistanceMiles: number | null;
  lotSizeSource:
    | "parcel_data"
    | "solar_estimate"
    | "house_footprint_estimate"
    | "regional_typical_estimate"
    | "lead_parcel"
    | "unavailable";
  houseSqftSource:
    | "solar_building_ground_area"
    | "lot_coverage_estimate"
    | "regional_typical_estimate"
    | "unavailable";
  locationSource: "place_details" | "reverse_geocode" | "address_geocode" | "unavailable";
};

function roundToWhole(value: number): number {
  return Math.max(0, Math.round(value));
}

function squareMetersToSquareFeet(value: number): number {
  return value * SQFT_PER_SQM;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pickAddressComponent(
  components: Array<{ long_name?: string; types?: string[] }> | undefined,
  type: string
): string | null {
  return components?.find((component) => component.types?.includes(type))?.long_name ?? null;
}

function parseGoogleAddressContext(result: {
  formatted_address?: string;
  formattedAddress?: string;
  address_components?: Array<{ long_name?: string; types?: string[] }>;
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
}): AddressContext {
  const legacyComponents = result.address_components;
  const newComponents = result.addressComponents?.map((component) => ({
    long_name: component.longText,
    types: component.types
  }));
  const components = legacyComponents ?? newComponents;

  return {
    formattedAddress: result.formatted_address ?? result.formattedAddress ?? null,
    city:
      pickAddressComponent(components, "locality") ??
      pickAddressComponent(components, "postal_town") ??
      pickAddressComponent(components, "administrative_area_level_2"),
    state: pickAddressComponent(components, "administrative_area_level_1"),
    zipCode: pickAddressComponent(components, "postal_code")
  };
}

async function fetchPlaceDetailsContext(placeId: string, key: string): Promise<AddressContext | null> {
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "formattedAddress,addressComponents,location"
      },
      cache: "no-store"
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      formattedAddress?: string;
      addressComponents?: Array<{ longText?: string; types?: string[] }>;
    };
    return parseGoogleAddressContext(data);
  } catch {
    return null;
  }
}

async function fetchGeocodeContext(
  query: { address?: string; lat?: number; lng?: number },
  key: string
): Promise<AddressContext | null> {
  try {
    const params = new URLSearchParams({ key });
    if (query.lat != null && query.lng != null) {
      params.set("latlng", `${query.lat},${query.lng}`);
    } else if (query.address) {
      params.set("address", query.address);
    } else {
      return null;
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      {
        cache: "no-store"
      }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    };

    const first = data.results?.[0];
    return first ? parseGoogleAddressContext(first) : null;
  } catch {
    return null;
  }
}

async function fetchSolarHouseSqft(lat: number, lng: number, key: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      "location.latitude": String(lat),
      "location.longitude": String(lng),
      requiredQuality: "MEDIUM",
      key
    });

    const response = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      solarPotential?: {
        buildingStats?: { groundAreaMeters2?: number };
        wholeRoofStats?: { groundAreaMeters2?: number };
      };
    };

    const groundAreaMeters =
      data.solarPotential?.buildingStats?.groundAreaMeters2 ??
      data.solarPotential?.wholeRoofStats?.groundAreaMeters2;

    return groundAreaMeters ? roundToWhole(squareMetersToSquareFeet(groundAreaMeters)) : null;
  } catch {
    return null;
  }
}

function estimateHouseSqftFromLotSize(lotSizeSqft: number): number {
  const coverageRatio =
    lotSizeSqft <= 5000 ? 0.32 : lotSizeSqft <= 9000 ? 0.26 : lotSizeSqft <= 15000 ? 0.2 : 0.16;
  const lowerBound =
    lotSizeSqft < 2200 ? lotSizeSqft * 0.28 : Math.min(900, lotSizeSqft * 0.45);
  const upperBound = Math.max(lowerBound + 1, lotSizeSqft * 0.62);
  return roundToWhole(clamp(lotSizeSqft * coverageRatio, lowerBound, upperBound));
}

function estimateLotSizeFromRegion(input: {
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  houseSqft?: number | null;
}): number {
  const model = resolveRegionalCostModel({
    city: input.city,
    state: input.state,
    zipCode: input.zipCode
  });

  if (input.houseSqft && input.houseSqft > 0) {
    return roundToWhole(Math.max(model.typicalLotSqft, input.houseSqft * 2.35));
  }

  return roundToWhole(model.typicalLotSqft);
}

function estimateLotSizeFromSolarFootprint(input: {
  solarHouseSqft: number;
  typicalLotSqft: number;
}): number {
  const typicalLotSqft = input.typicalLotSqft;
  const coverageRatio =
    typicalLotSqft <= 5000 ? 0.42 :
    typicalLotSqft <= 6500 ? 0.36 :
    typicalLotSqft <= 9000 ? 0.31 :
    typicalLotSqft <= 15000 ? 0.24 :
    0.18;
  const rawEstimate = input.solarHouseSqft / coverageRatio;
  const lowerBound = Math.max(input.solarHouseSqft * 1.6, 1800);
  const upperBound = Math.max(lowerBound + 1, typicalLotSqft * 1.15);

  return roundToWhole(clamp(rawEstimate, lowerBound, upperBound));
}

function resolveLotSize(input: {
  parcelLotSizeSqft: number | null;
  solarHouseSqft: number | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}): { lotSizeSqft: number | null; lotSizeSource: PropertyData["lotSizeSource"] } {
  if (input.parcelLotSizeSqft != null) {
    return { lotSizeSqft: input.parcelLotSizeSqft, lotSizeSource: "parcel_data" };
  }

  if (input.solarHouseSqft != null) {
    const hasRegionalContext = Boolean(input.city || input.state || input.zipCode);
    const contextualTypicalLotSqft = hasRegionalContext
      ? estimateLotSizeFromRegion({
          city: input.city,
          state: input.state,
          zipCode: input.zipCode,
          houseSqft: input.solarHouseSqft
        })
      : 4800;

    return {
      lotSizeSqft: estimateLotSizeFromSolarFootprint({
        solarHouseSqft: input.solarHouseSqft,
        typicalLotSqft: contextualTypicalLotSqft
      }),
      lotSizeSource: hasRegionalContext ? "solar_estimate" : "house_footprint_estimate"
    };
  }

  const regionalLotSizeSqft = estimateLotSizeFromRegion({
    city: input.city,
    state: input.state,
    zipCode: input.zipCode,
    houseSqft: null
  });

  return {
    lotSizeSqft: regionalLotSizeSqft ?? null,
    lotSizeSource: regionalLotSizeSqft != null ? "regional_typical_estimate" : "unavailable"
  };
}

function resolveBackyardSqft(lotSizeSqft: number | null, houseSqft: number | null): number | null {
  if (lotSizeSqft == null || lotSizeSqft <= 0) return null;
  if (houseSqft == null || houseSqft <= 0) {
    return roundToWhole(Math.max(lotSizeSqft * 0.58, 250));
  }

  const rawBackyardSqft = lotSizeSqft - houseSqft;
  if (rawBackyardSqft > 0) {
    return roundToWhole(rawBackyardSqft);
  }

  return roundToWhole(Math.max(lotSizeSqft * 0.35, 250));
}

export async function getPropertyData(input: PropertyLookupInput): Promise<PropertyData> {
  const key = getGoogleMapsApiKey();

  let addressContext: AddressContext | null = null;
  let locationSource: PropertyData["locationSource"] = "unavailable";

  if (key && input.placeId) {
    addressContext = await fetchPlaceDetailsContext(input.placeId, key);
    if (addressContext) locationSource = "place_details";
  }

  if (!addressContext && key && input.lat != null && input.lng != null) {
    addressContext = await fetchGeocodeContext({ lat: input.lat, lng: input.lng }, key);
    if (addressContext) locationSource = "reverse_geocode";
  }

  if (!addressContext && key) {
    addressContext = await fetchGeocodeContext({ address: input.address }, key);
    if (addressContext) locationSource = "address_geocode";
  }

  const parcelLotSizeSqft =
    input.parcelLotSizeSqft && input.parcelLotSizeSqft > 0 ? roundToWhole(input.parcelLotSizeSqft) : null;

  const solarHouseSqft =
    key && input.lat != null && input.lng != null
      ? await fetchSolarHouseSqft(input.lat, input.lng, key)
      : null;
  const { lotSizeSqft, lotSizeSource } = resolveLotSize({
    parcelLotSizeSqft,
    solarHouseSqft,
    city: addressContext?.city,
    state: addressContext?.state,
    zipCode: addressContext?.zipCode
  });

  const houseSqft =
    solarHouseSqft ??
    (lotSizeSqft != null ? estimateHouseSqftFromLotSize(lotSizeSqft) : null);

  const houseSqftSource: PropertyData["houseSqftSource"] = solarHouseSqft
    ? "solar_building_ground_area"
    : lotSizeSqft != null
      ? parcelLotSizeSqft != null
        ? "lot_coverage_estimate"
        : "regional_typical_estimate"
      : "unavailable";

  const estimatedBackyardSqft = resolveBackyardSqft(lotSizeSqft, houseSqft);
  console.log("Property data lot size resolution:", {
    lotSizeSqft,
    lotSizeSource,
    houseSqft,
    houseSqftSource,
    locationSource
  });

  return {
    formattedAddress: addressContext?.formattedAddress ?? input.address,
    city: addressContext?.city ?? null,
    state: addressContext?.state ?? null,
    zipCode: addressContext?.zipCode ?? null,
    lotSizeSqft,
    houseSqft,
    estimatedBackyardSqft,
    travelDistanceMiles: input.travelDistanceMiles ?? null,
    lotSizeSource,
    houseSqftSource,
    locationSource
  };
}
