import { describe, expect, it } from "vitest";
import {
  formatServiceQuestionAnswers,
  getRequiredQuestionIssues,
  normalizeServiceQuestionAnswers,
  serviceQuestions
} from "../../lib/serviceQuestions";
import { SERVICE_OPTIONS } from "../../lib/services";

describe("service questions", () => {
  it("covers every service with the expanded canonical question sets", () => {
    expect(Object.keys(serviceQuestions).sort()).toEqual([...SERVICE_OPTIONS].sort());

    for (const service of SERVICE_OPTIONS) {
      expect(serviceQuestions[service].length).toBeGreaterThanOrEqual(4);
      expect(serviceQuestions[service].length).toBeLessThanOrEqual(5);
    }
  });

  it("uses unique answer keys per service", () => {
    for (const service of SERVICE_OPTIONS) {
      const keys = serviceQuestions[service].map((question) => question.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("uses the canonical lawn care question set", () => {
    const lawnQuestions = serviceQuestions["Lawn Care / Maintenance"];

    expect(lawnQuestions.map((question) => question.key)).toEqual([
      "lawn_work_type",
      "lawn_area_size",
      "lawn_condition",
      "lawn_property_type"
    ]);
    expect(lawnQuestions[0].options).toContain("Mowing and edging");
    expect(lawnQuestions[1].options).toContain("Very large lot (10,000+ sq ft)");
    expect(lawnQuestions[2].options).toContain("Thick weeds or neglected");
    expect(lawnQuestions[3].options).toContain("Front and backyard");
  });

  it("enables selective multi-select only on the approved questions", () => {
    const concreteQuestions = serviceQuestions.Concrete;
    const pressureQuestions = serviceQuestions["Pressure Washing"];
    const landscapingQuestions = serviceQuestions["Landscaping / Installation"];
    const fenceQuestions = serviceQuestions["Fence Installation / Repair"];
    const deckQuestions = serviceQuestions["Deck Installation / Repair"];

    expect(concreteQuestions).toHaveLength(5);
    expect(concreteQuestions[0].inputType).toBe("checkbox");
    expect(concreteQuestions[2].options).toContain("Stamped or decorative concrete");
    expect(concreteQuestions[4].options).toContain("Existing concrete needs removal");
    expect(pressureQuestions[0].inputType).toBe("checkbox");
    expect(pressureQuestions[1].inputType).toBe("radio");
    expect(landscapingQuestions[0].inputType).toBe("checkbox");
    expect(landscapingQuestions[3].inputType).toBe("checkbox");
    expect(fenceQuestions[4].options).toContain("Not applicable / not a repair");
    expect(deckQuestions[4].options).toContain("Not applicable / not a repair");
    expect(serviceQuestions["Roofing"][0].inputType).toBe("radio");
  });

  it("uses the standard Other pattern for the two roofing answer sets", () => {
    const roofingQuestions = serviceQuestions.Roofing;
    const roofTypeQuestion = roofingQuestions[1];
    const roofProblemQuestion = roofingQuestions[2];

    expect(roofTypeQuestion.options).toEqual(["Shingle", "Tile", "Metal", "Flat roof", "Other"]);
    expect(roofProblemQuestion.options).toEqual([
      "Missing or damaged area",
      "Leak or water issue",
      "Old roof needing replacement",
      "Storm or major damage",
      "Other"
    ]);
    expect(getRequiredQuestionIssues("Roofing", {
      roofing_work_type: "Minor repair",
      roofing_type: "Other",
      roofing_problem: "Other",
      roofing_scope: "Small section",
      roofing_access: "Easy"
    })).toEqual([]);
  });

  it("uses the final outdoor lighting question set", () => {
    const lightingQuestions = serviceQuestions["Outdoor Lighting Installation"];

    expect(lightingQuestions.map((question) => question.key)).toEqual([
      "lighting_work_type",
      "lighting_type",
      "lighting_scope",
      "lighting_power",
      "lighting_install_difficulty"
    ]);
    expect(lightingQuestions[0].question).toBe("What do you need help with?");
    expect(lightingQuestions[0].options).toEqual([
      "Install lights I already have",
      "Install a basic new lighting setup",
      "Install a full new lighting system",
      "Add to an existing system",
      "Repair existing lighting",
      "Other"
    ]);
    expect(lightingQuestions[1].question).toBe("What kind of lighting is this for?");
    expect(lightingQuestions[1].inputType).toBe("checkbox");
    expect(lightingQuestions[1].options).toEqual([
      "Pathway lights",
      "Driveway lights",
      "Accent or landscape lights",
      "Patio or string lights",
      "Security or flood lights",
      "Other"
    ]);
    expect(lightingQuestions[2].question).toBe("How much of the property needs lighting work?");
    expect(lightingQuestions[2].options).toEqual([
      "One small area",
      "One medium-sized area",
      "One large area",
      "Multiple areas",
      "Not sure"
    ]);
    expect(lightingQuestions[3].question).toBe("Is power already available where the lighting is needed?");
    expect(lightingQuestions[4].question).toBe("What best describes the installation difficulty?");
    expect(getRequiredQuestionIssues("Outdoor Lighting Installation", {
      lighting_work_type: "Other",
      lighting_type: ["Pathway lights", "Other"],
      lighting_scope: "One small area",
      lighting_power: "Yes",
      lighting_install_difficulty: "Easy access, simple install"
    })).toEqual([]);
  });

  it("formats customer answers in question order and preserves contractor detail separately", () => {
    expect(formatServiceQuestionAnswers("Outdoor Lighting Installation", {
      lighting_work_type: "Install lights I already have",
      lighting_type: ["Driveway lights", "Pathway lights", "Other"],
      lighting_type_other_text: "Entry monument lights",
      lighting_scope: "One medium-sized area",
      lighting_power: "Yes",
      lighting_install_difficulty: "Easy access, simple install"
    })).toEqual([
      {
        key: "lighting_work_type",
        label: "Need help with",
        value: "Install lights I already have"
      },
      {
        key: "lighting_type",
        label: "Lighting type",
        value: "Driveway lights, Pathway lights"
      },
      {
        key: "lighting_type_contractor_note",
        label: "Lighting type detail",
        value: "Entry monument lights"
      },
      {
        key: "lighting_scope",
        label: "Area size",
        value: "One medium-sized area"
      },
      {
        key: "lighting_power",
        label: "Power available",
        value: "Yes"
      },
      {
        key: "lighting_install_difficulty",
        label: "Difficulty",
        value: "Easy access, simple install"
      }
    ]);
  });

  it("applies deterministic fallback mapping for vague answers", () => {
    expect(normalizeServiceQuestionAnswers("Roofing", {
      roofing_work_type: "Other",
      roofing_work_type_other_text: "Need a weird custom roof setup",
      roofing_type: "Other",
      roofing_type_other_text: "Copper-look finish",
      roofing_problem: "Other",
      roofing_scope: "Not sure",
      roofing_access: "Not sure"
    })).toEqual({
      roofing_work_type: "Leak repair",
      roofing_work_type_contractor_note: "Need a weird custom roof setup",
      roofing_type: "Shingle",
      roofing_type_contractor_note: "Copper-look finish",
      roofing_problem: "Leak or water issue",
      roofing_scope: "One area or slope",
      roofing_access: "Moderate"
    });
  });

  it("requires only the outdoor gate question for non-outdoor Other requests", () => {
    expect(getRequiredQuestionIssues("Other", {
      other_outdoor_service: "No"
    })).toEqual([]);

    expect(normalizeServiceQuestionAnswers("Other", {
      other_outdoor_service: "No",
      other_work_type: "Repair",
      other_size: "Large",
      other_property_type: "Commercial property",
      other_access: "Difficult"
    })).toEqual({
      other_outdoor_service: "No"
    });
  });

  it("leaves the roofing Other pattern intact", () => {
    const roofingQuestions = serviceQuestions.Roofing;

    expect(roofingQuestions[1].options).toEqual(["Shingle", "Tile", "Metal", "Flat roof", "Other"]);
    expect(roofingQuestions[2].options).toEqual([
      "Missing or damaged area",
      "Leak or water issue",
      "Old roof needing replacement",
      "Storm or major damage",
      "Other"
    ]);
  });
});
