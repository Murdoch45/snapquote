import { resolveRegionalCostModel } from "@/lib/ai/cost-models";
import type { PropertyData } from "@/lib/property-data";
import { estimateConcrete } from "@/estimators/concreteEstimator";
import { estimateDeck } from "@/estimators/deckEstimator";
import { estimateFence } from "@/estimators/fenceEstimator";
import { estimateGutterCleaning } from "@/estimators/gutterCleaningEstimator";
import { estimateJunkRemoval } from "@/estimators/junkRemovalEstimator";
import { estimateLandscaping } from "@/estimators/landscapingEstimator";
import { estimateLawnCare } from "@/estimators/lawnCareEstimator";
import { estimateLighting } from "@/estimators/lightingEstimator";
import { estimateOther } from "@/estimators/otherEstimator";
import { estimatePainting } from "@/estimators/paintingEstimator";
import { estimatePoolService } from "@/estimators/poolServiceEstimator";
import { estimatePressureWashing } from "@/estimators/pressureWashingEstimator";
import { estimateRoofing } from "@/estimators/roofingEstimator";
import {
  aggregateEngineEstimate,
  type AiEstimatorSignals,
  type CanonicalService,
  type EngineEstimate,
  type EstimatorContext,
  type ServiceRequest
} from "@/estimators/shared";
import { estimateTreeService } from "@/estimators/treeServiceEstimator";
import { estimateWindowCleaning } from "@/estimators/windowCleaningEstimator";

type EstimateEngineInput = {
  services: ServiceRequest[];
  propertyData: PropertyData;
  description: string;
  photoCount: number;
  signals: AiEstimatorSignals;
};

const serviceAliases: Record<string, CanonicalService> = {
  "Pressure Washing": "Pressure Washing",
  "Gutter Cleaning": "Gutter Cleaning",
  "Window Cleaning": "Window Cleaning",
  "Pool Service / Cleaning": "Pool Service / Cleaning",
  "Lawn Care / Maintenance": "Lawn Care / Maintenance",
  "Landscaping / Installation": "Landscaping / Installation",
  "Tree Service / Removal": "Tree Service / Removal",
  "Fence Installation / Repair": "Fence Installation / Repair",
  Concrete: "Concrete",
  "Concrete / Pavers": "Concrete",
  "Concrete / Pavers (Driveways / Patios / Walkways)": "Concrete",
  "Deck Installation / Repair": "Deck Installation / Repair",
  "Exterior Painting": "Exterior Painting",
  Roofing: "Roofing",
  "Roofing (Repair / Replacement / Maintenance)": "Roofing",
  "Junk Removal": "Junk Removal",
  "Outdoor Lighting Installation": "Outdoor Lighting Installation",
  "Outdoor Lighting / Installation": "Outdoor Lighting Installation",
  Other: "Other"
};

export function normalizeServiceName(service: string): CanonicalService {
  return serviceAliases[service] ?? "Other";
}

export function estimateEngine(input: EstimateEngineInput): EngineEstimate {
  const regionalModel = resolveRegionalCostModel({
    city: input.propertyData.city,
    state: input.propertyData.state,
    zipCode: input.propertyData.zipCode
  });

  const serviceEstimates = input.services.map((request) => {
    const context: EstimatorContext = {
      request,
      propertyData: input.propertyData,
      regionalModel,
      description: input.description,
      photoCount: input.photoCount,
      signals: input.signals
    };

    switch (request.service) {
      case "Pressure Washing":
        return estimatePressureWashing(context);
      case "Gutter Cleaning":
        return estimateGutterCleaning(context);
      case "Window Cleaning":
        return estimateWindowCleaning(context);
      case "Pool Service / Cleaning":
        return estimatePoolService(context);
      case "Lawn Care / Maintenance":
        return estimateLawnCare(context);
      case "Landscaping / Installation":
        return estimateLandscaping(context);
      case "Tree Service / Removal":
        return estimateTreeService(context);
      case "Fence Installation / Repair":
        return estimateFence(context);
      case "Concrete":
        return estimateConcrete(context);
      case "Deck Installation / Repair":
        return estimateDeck(context);
      case "Exterior Painting":
        return estimatePainting(context);
      case "Roofing":
        return estimateRoofing(context);
      case "Junk Removal":
        return estimateJunkRemoval(context);
      case "Outdoor Lighting Installation":
        return estimateLighting(context);
      default:
        return estimateOther(context);
    }
  });

  return aggregateEngineEstimate(serviceEstimates, input.propertyData, regionalModel, input.signals, {
    services: input.services,
    description: input.description,
    photoCount: input.photoCount
  });
}
