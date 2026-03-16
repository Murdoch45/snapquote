import type { ServiceType } from "@/lib/services";

export type ServiceQuestionConfig = {
  key: string;
  question: string;
  inputType: "radio" | "select" | "checkbox";
  options: readonly string[];
  otherPlaceholder?: string;
  exclusiveOptions?: readonly string[];
};

export type ServiceQuestionAnswerValue = string | string[];
export type ServiceQuestionAnswers = Record<string, ServiceQuestionAnswerValue>;
export type ServiceQuestionAnswerBundle = {
  service: ServiceType;
  answers: ServiceQuestionAnswers;
};
export type FormattedServiceQuestionAnswer = {
  key: string;
  label: string;
  value: string;
};

type QuestionFallbackValue = string | readonly string[] | null;

const CUSTOMER_ANSWER_LABEL_OVERRIDES: Record<string, string> = {
  lighting_work_type: "Need help with",
  lighting_type: "Lighting type",
  lighting_scope: "Area size",
  lighting_power: "Power available",
  lighting_install_difficulty: "Difficulty"
};

const MULTI_SELECT_DELIMITER = " | ";
const CONTRACTOR_NOTE_SUFFIX = "_contractor_note";
export const OTHER_OUTDOOR_QUESTION_KEY = "other_outdoor_service";
export const OTHER_OUTDOOR_UNSUPPORTED_MESSAGE =
  "Sorry, the current SnapQuote model only supports outdoor services at this time.";
const VAGUE_ANSWER_SET = new Set(["other", "not sure"]);

const QUESTION_FALLBACK_MAP: Partial<
  Record<ServiceType, Partial<Record<string, QuestionFallbackValue>>>
> = {
  "Pressure Washing": {
    pressure_washing_target: null,
    pressure_washing_size: "Medium area (~500-1,500 sq ft)",
    pressure_washing_condition: "Moderate buildup",
    pressure_washing_access: "Some obstacles"
  },
  "Gutter Cleaning": {
    gutter_building_type: null,
    gutter_work_type: "Clean gutters and downspouts",
    gutter_fill_level: "Moderate debris",
    gutter_access: "Yes, landscaping or obstacles"
  },
  "Window Cleaning": {
    window_target_type: "Standard exterior house windows",
    window_count: "11-25",
    window_property_type: "Two-story home",
    window_access: "Some ladders needed"
  },
  "Pool Service / Cleaning": {
    pool_work_type: "Routine cleaning",
    pool_type: "In-ground pool",
    pool_condition: "Needs normal cleaning",
    pool_size: "Medium",
    pool_access: "Somewhat"
  },
  "Lawn Care / Maintenance": {
    lawn_work_type: "Mowing and edging",
    lawn_area_size: "Medium yard (~2,000-5,000 sq ft)",
    lawn_condition: "Slightly overgrown",
    lawn_property_type: "Front and backyard"
  },
  "Landscaping / Installation": {
    landscape_work_type: "Rock or mulch installation",
    landscape_area_size: "One side of yard (~500-1,500 sq ft)",
    landscape_job_type: "Refresh existing landscaping",
    landscape_materials: "Mixed materials",
    landscape_access: "Somewhat difficult"
  },
  "Tree Service / Removal": {
    tree_work_type: "Trim or cut back branches",
    tree_size: "Medium",
    tree_location: "Backyard",
    tree_access: "Moderate",
    tree_haul_away: "Yes"
  },
  "Fence Installation / Repair": {
    fence_work_type: "Fence repair",
    fence_material: "Wood",
    fence_scope: "One side (~25-75 linear ft)",
    fence_site: "Some slope",
    fence_repair_condition: "Moderate"
  },
  Concrete: {
    concrete_project_type: "Driveway",
    concrete_work_type: "Replacement",
    concrete_material: "Standard concrete",
    concrete_scope: "Medium (~200-600 sq ft)",
    concrete_site_condition: "Open and ready"
  },
  "Deck Installation / Repair": {
    deck_work_type: "Repair existing deck",
    deck_material: "Wood",
    deck_scope: "Medium (~150-350 sq ft)",
    deck_area_type: "Raised deck",
    deck_repair_condition: "Some damaged boards"
  },
  "Exterior Painting": {
    painting_target: "Partial exterior",
    painting_surface_type: "Siding",
    painting_condition: "Minor peeling or wear",
    painting_scope: "One side or small area",
    painting_access: "Two-story areas"
  },
  Roofing: {
    roofing_work_type: "Leak repair",
    roofing_type: "Shingle",
    roofing_problem: "Leak or water issue",
    roofing_scope: "One area or slope",
    roofing_access: "Moderate"
  },
  "Junk Removal": {
    junk_type: "Household junk",
    junk_amount: "Small load (about a pickup load)",
    junk_location: "Garage or driveway",
    junk_heavy_items: "Yes, a few"
  },
  "Outdoor Lighting Installation": {
    lighting_work_type: "Install a basic new lighting setup",
    lighting_type: "Accent or landscape lights",
    lighting_scope: "One medium-sized area",
    lighting_power: "Partly",
    lighting_install_difficulty: "Some wiring or layout work needed"
  },
  Other: {
    other_work_type: "Cleaning",
    other_size: "Medium",
    other_property_type: "Standard home",
    other_access: "Moderate"
  }
};

function hasVagueSelection(selections: readonly string[]): boolean {
  return selections.some((selection) => VAGUE_ANSWER_SET.has(selection.trim().toLowerCase()));
}

export function isOtherServiceOutdoorBlocked(
  service: ServiceType,
  answers: Record<string, unknown>
): boolean {
  if (service !== "Other") return false;
  const value = answers[OTHER_OUTDOOR_QUESTION_KEY];
  return typeof value === "string" && value.trim().toLowerCase() === "no";
}

function resolveQuestionFallback(
  service: ServiceType,
  question: ServiceQuestionConfig,
  value: ServiceQuestionAnswerValue | undefined
): ServiceQuestionAnswerValue | undefined {
  if (value === undefined) return undefined;
  const selections = parseQuestionAnswer(value);
  const concreteSelections = selections.filter(
    (selection) => !VAGUE_ANSWER_SET.has(selection.trim().toLowerCase())
  );

  if (question.inputType === "checkbox" && concreteSelections.length > 0) {
    return concreteSelections;
  }

  if (!hasVagueSelection(selections)) return value;

  const fallback = QUESTION_FALLBACK_MAP[service]?.[question.key];
  if (fallback === undefined) return value;
  if (fallback === null) return undefined;
  const fallbackSelections = Array.isArray(fallback) ? [...fallback] : [fallback];

  if (question.inputType === "checkbox") {
    return fallbackSelections.length > 0 ? fallbackSelections : undefined;
  }

  return fallbackSelections[0];
}

const createQuestion = (
  key: string,
  question: string,
  options: readonly string[],
  inputType: "radio" | "select" | "checkbox" = "radio",
  otherPlaceholder = "Add more detail",
  exclusiveOptions?: readonly string[]
): ServiceQuestionConfig => ({
  key,
  question,
  options,
  inputType,
  otherPlaceholder,
  exclusiveOptions
});

export function parseQuestionAnswer(value?: ServiceQuestionAnswerValue | null): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  }
  if (!value || typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(MULTI_SELECT_DELIMITER)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function serializeQuestionAnswer(values: readonly string[]): string {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).join(MULTI_SELECT_DELIMITER);
}

export function isQuestionAnswered(value: ServiceQuestionAnswerValue | undefined): boolean {
  return parseQuestionAnswer(value).length > 0;
}

export function normalizeQuestionAnswerValue(
  question: ServiceQuestionConfig,
  value: unknown
): ServiceQuestionAnswerValue | undefined {
  const selections = parseQuestionAnswer(value as string | string[] | undefined);
  if (question.inputType === "checkbox") {
    return selections.length > 0 ? selections : undefined;
  }

  const stringValue =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? selections[0] ?? ""
        : "";

  return stringValue.length > 0 ? stringValue : undefined;
}

export function normalizeServiceQuestionAnswers(
  service: ServiceType,
  answers: Record<string, unknown>
): ServiceQuestionAnswers {
  const normalized: ServiceQuestionAnswers = {};
  const otherServiceBlocked = isOtherServiceOutdoorBlocked(service, answers);

  for (const question of serviceQuestions[service]) {
    if (otherServiceBlocked && question.key !== OTHER_OUTDOOR_QUESTION_KEY) {
      continue;
    }

    const rawNormalizedValue = normalizeQuestionAnswerValue(question, answers[question.key]);
    const normalizedValue = resolveQuestionFallback(service, question, rawNormalizedValue);
    if (normalizedValue !== undefined) {
      normalized[question.key] = normalizedValue;
    }

    const selections = parseQuestionAnswer(rawNormalizedValue as string | string[] | undefined);
    const otherText = typeof answers[`${question.key}_other_text`] === "string"
      ? String(answers[`${question.key}_other_text`]).trim()
      : "";

    if (hasVagueSelection(selections) && otherText.length > 0) {
      normalized[`${question.key}${CONTRACTOR_NOTE_SUFFIX}`] = otherText;
    }
  }

  return normalized;
}

export function getRequiredQuestionIssues(
  service: ServiceType,
  answers: Record<string, unknown>
): Array<{ key: string; message: string }> {
  if (service === "Other") {
    const outdoorQuestion = serviceQuestions.Other.find((question) => question.key === OTHER_OUTDOOR_QUESTION_KEY);
    if (outdoorQuestion) {
      const outdoorAnswer = normalizeQuestionAnswerValue(outdoorQuestion, answers[OTHER_OUTDOOR_QUESTION_KEY]);
      if (!isQuestionAnswered(outdoorAnswer)) {
        return [{ key: OTHER_OUTDOOR_QUESTION_KEY, message: `Answer required: ${outdoorQuestion.question}` }];
      }
      if (typeof outdoorAnswer === "string" && outdoorAnswer.trim().toLowerCase() === "no") {
        return [];
      }
    }
  }

  return serviceQuestions[service].flatMap((question) => {
    const normalizedValue = normalizeQuestionAnswerValue(question, answers[question.key]);
    const contractorNote =
      typeof answers[`${question.key}${CONTRACTOR_NOTE_SUFFIX}`] === "string"
        ? String(answers[`${question.key}${CONTRACTOR_NOTE_SUFFIX}`]).trim()
        : "";

    if (contractorNote.length > 0) {
      return [];
    }

    if (!isQuestionAnswered(normalizedValue)) {
      return [{ key: question.key, message: `Answer required: ${question.question}` }];
    }

    return [];
  });
}

export function parseServiceQuestionBundles(value: unknown): ServiceQuestionAnswerBundle[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const service =
      "service" in entry && typeof entry.service === "string" ? (entry.service as ServiceType) : null;
    if (!service || !(service in serviceQuestions)) return [];

    const rawAnswers =
      "answers" in entry && entry.answers && typeof entry.answers === "object"
        ? (entry.answers as Record<string, unknown>)
        : {};

    return [
      {
        service,
        answers: normalizeServiceQuestionAnswers(service, rawAnswers)
      }
    ];
  });
}

function customerAnswerLabel(question: ServiceQuestionConfig): string {
  if (CUSTOMER_ANSWER_LABEL_OVERRIDES[question.key]) {
    return CUSTOMER_ANSWER_LABEL_OVERRIDES[question.key];
  }

  if (/_work_type$/.test(question.key)) return "Need help with";
  if (/_property_type$/.test(question.key)) return "Property type";
  if (/_type$/.test(question.key)) return "Type";
  if (/_scope$/.test(question.key)) return "Scope";
  if (/_area_size$/.test(question.key) || /_size$/.test(question.key)) return "Area size";
  if (/_count$/.test(question.key)) return "Count";
  if (/_condition$/.test(question.key) || /fill_level|repair_condition/.test(question.key)) return "Condition";
  if (/_access$/.test(question.key)) return "Access";
  if (/power/.test(question.key)) return "Power available";
  if (/materials?/.test(question.key)) return "Materials";
  if (/location/.test(question.key)) return "Location";
  if (/problem/.test(question.key)) return "Problem";
  if (/amount/.test(question.key)) return "Amount";
  if (/heavy_items/.test(question.key)) return "Heavy items";
  if (/haul_away/.test(question.key)) return "Haul-away";
  if (/job_type/.test(question.key)) return "Job type";

  return question.question.replace(/\?$/, "");
}

export function formatServiceQuestionAnswers(
  service: ServiceType,
  answers: Record<string, unknown>
): FormattedServiceQuestionAnswer[] {
  const normalizedAnswers = normalizeServiceQuestionAnswers(service, answers);
  const otherServiceBlocked = isOtherServiceOutdoorBlocked(service, normalizedAnswers);

  return serviceQuestions[service].flatMap((question) => {
    if (otherServiceBlocked && question.key !== OTHER_OUTDOOR_QUESTION_KEY) {
      return [];
    }

    const selections = parseQuestionAnswer(normalizedAnswers[question.key]);
    if (selections.length === 0) return [];

    const contractorNote =
      typeof normalizedAnswers[`${question.key}${CONTRACTOR_NOTE_SUFFIX}`] === "string"
        ? String(normalizedAnswers[`${question.key}${CONTRACTOR_NOTE_SUFFIX}`]).trim()
        : "";

    const formatted: FormattedServiceQuestionAnswer[] = [
      {
        key: question.key,
        label: customerAnswerLabel(question),
        value: selections.join(", ")
      }
    ];

    if (contractorNote) {
      formatted.push({
        key: `${question.key}${CONTRACTOR_NOTE_SUFFIX}`,
        label: `${customerAnswerLabel(question)} detail`,
        value: contractorNote
      });
    }

    return formatted;
  });
}

export const serviceQuestions: Record<ServiceType, readonly ServiceQuestionConfig[]> = {
  "Pressure Washing": [
    createQuestion("pressure_washing_target", "What do you want cleaned?", [
      "Driveway",
      "Patio or porch",
      "House exterior",
      "Fence",
      "Roof",
      "Other"
    ], "checkbox"),
    createQuestion("pressure_washing_size", "About how much needs to be cleaned?", [
      "Small area (up to ~500 sq ft)",
      "Medium area (~500-1,500 sq ft)",
      "Large area (~1,500-3,000 sq ft)",
      "Whole property / very large area (3,000+ sq ft)",
      "Not sure"
    ]),
    createQuestion("pressure_washing_condition", "How dirty is it?", [
      "Light dirt or dust",
      "Moderate buildup",
      "Heavy staining or moss",
      "Oil, rust, or deep stains",
      "Not sure"
    ]),
    createQuestion("pressure_washing_access", "Is the area easy to access?", [
      "Easy access",
      "Some obstacles",
      "Tight or difficult access",
      "Not sure"
    ])
  ],
  "Gutter Cleaning": [
    createQuestion("gutter_building_type", "What type of building is this for?", [
      "Single-story home",
      "Two-story home",
      "Three-story or taller",
      "Detached garage or shed",
      "Other"
    ]),
    createQuestion("gutter_work_type", "What do you need done?", [
      "Clean gutters only",
      "Clean gutters and downspouts",
      "Minor gutter repair",
      "Gutter guard cleaning",
      "Other"
    ]),
    createQuestion("gutter_fill_level", "About how full are the gutters?", [
      "Light debris",
      "Moderate debris",
      "Very full or overflowing",
      "Plants or heavy buildup",
      "Not sure"
    ]),
    createQuestion("gutter_access", "Are there any access challenges?", [
      "No",
      "Yes, landscaping or obstacles",
      "Yes, steep roof or hard access",
      "Not sure"
    ])
  ],
  "Window Cleaning": [
    createQuestion("window_target_type", "What kind of windows need cleaning?", [
      "Standard exterior house windows",
      "Large exterior windows or glass doors",
      "Second-story or hard-to-reach windows",
      "Skylights",
      "Other"
    ]),
    createQuestion("window_count", "About how many windows need cleaning?", [
      "1-10",
      "11-25",
      "26-50",
      "50+",
      "Not sure"
    ]),
    createQuestion("window_property_type", "What type of property is this?", [
      "Single-story home",
      "Two-story home",
      "Three-story or taller",
      "Small commercial building",
      "Other"
    ]),
    createQuestion("window_access", "How easy is access to the windows?", [
      "Easy",
      "Some ladders needed",
      "Hard-to-reach areas",
      "Not sure"
    ])
  ],
  "Pool Service / Cleaning": [
    createQuestion("pool_work_type", "What do you need help with?", [
      "Routine cleaning",
      "Green or dirty pool cleanup",
      "Opening or startup",
      "Closing or winterizing",
      "Other"
    ]),
    createQuestion("pool_type", "What type of pool is it?", [
      "In-ground pool",
      "Above-ground pool",
      "Pool and spa",
      "Spa only",
      "Not sure"
    ]),
    createQuestion("pool_condition", "What condition is the pool in right now?", [
      "Mostly clean",
      "Needs normal cleaning",
      "Very dirty",
      "Green or neglected",
      "Not sure"
    ]),
    createQuestion("pool_size", "About how large is the pool?", [
      "Small",
      "Medium",
      "Large",
      "Extra large / resort-style",
      "Not sure"
    ]),
    createQuestion("pool_access", "Is there easy access to the pool equipment and pool area?", [
      "Yes",
      "Somewhat",
      "No",
      "Not sure"
    ])
  ],
  "Lawn Care / Maintenance": [
    createQuestion("lawn_work_type", "What service do you need done?", [
      "Mowing only",
      "Mowing and edging",
      "Full lawn maintenance",
      "Overgrown cleanup",
      "Other"
    ]),
    createQuestion("lawn_area_size", "How big is the area that needs service?", [
      "Small yard (up to ~2,000 sq ft)",
      "Medium yard (~2,000-5,000 sq ft)",
      "Large yard (~5,000-10,000 sq ft)",
      "Very large lot (10,000+ sq ft)",
      "Not sure"
    ]),
    createQuestion("lawn_condition", "What is the current condition of the yard?", [
      "Well-maintained",
      "Slightly overgrown",
      "Very overgrown",
      "Thick weeds or neglected",
      "Not sure"
    ]),
    createQuestion("lawn_property_type", "What area of the property needs service?", [
      "Front yard only",
      "Backyard only",
      "Front and backyard",
      "Multi-area property",
      "Other"
    ])
  ],
  "Landscaping / Installation": [
    createQuestion("landscape_work_type", "What kind of landscaping work do you want?", [
      "New plants or garden beds",
      "Rock or mulch installation",
      "Sod or lawn installation",
      "Yard makeover",
      "Other"
    ], "checkbox"),
    createQuestion("landscape_area_size", "How much of the yard is involved?", [
      "Small section (up to ~500 sq ft)",
      "One side of yard (~500-1,500 sq ft)",
      "Most of front or backyard (~1,500-4,000 sq ft)",
      "Full property (4,000+ sq ft)",
      "Not sure"
    ]),
    createQuestion("landscape_job_type", "What best describes the job?", [
      "Refresh existing landscaping",
      "Replace old landscaping",
      "New installation on bare area",
      "Major redesign",
      "Not sure"
    ]),
    createQuestion("landscape_materials", "What materials are involved?", [
      "Mostly plants",
      "Mostly mulch or rock",
      "Sod or turf",
      "Mixed materials",
      "Not sure"
    ], "checkbox", "Add more detail", ["Not sure"]),
    createQuestion("landscape_access", "Is the area easy to access with materials and tools?", [
      "Easy",
      "Somewhat difficult",
      "Difficult",
      "Not sure"
    ])
  ],
  "Tree Service / Removal": [
    createQuestion("tree_work_type", "What service do you need done?", [
      "Trim or cut back branches",
      "Remove one tree",
      "Remove multiple trees",
      "Stump grinding",
      "Other"
    ]),
    createQuestion("tree_size", "How large is the tree or trees?", [
      "Small",
      "Medium",
      "Large",
      "Very large",
      "Not sure"
    ]),
    createQuestion("tree_location", "Where is the tree / trees located?", [
      "Front yard",
      "Backyard",
      "Multiple areas",
      "Near power lines",
      "Other"
    ]),
    createQuestion("tree_access", "How easy is access for the crew and equipment?", [
      "Easy",
      "Moderate",
      "Difficult",
      "Not sure"
    ]),
    createQuestion("tree_haul_away", "Do you want haul-away included?", [
      "Yes",
      "No",
      "Not sure"
    ])
  ],
  "Fence Installation / Repair": [
    createQuestion("fence_work_type", "What service do you need?", [
      "New fence installation",
      "Fence replacement",
      "Fence repair",
      "Gate repair or replacement",
      "Other"
    ]),
    createQuestion("fence_material", "What fence material do you want?", [
      "Wood",
      "Vinyl",
      "Chain link",
      "Metal or aluminum",
      "Other"
    ]),
    createQuestion("fence_scope", "About how much fence work is needed?", [
      "Small section (up to ~25 linear ft)",
      "One side (~25-75 linear ft)",
      "Several sides (~75-200 linear ft)",
      "Full yard (200+ linear ft)",
      "Other"
    ]),
    createQuestion("fence_site", "What is the site like?", [
      "Flat and clear",
      "Some slope",
      "Heavy slope or obstacles",
      "Tight access",
      "Not sure"
    ]),
    createQuestion("fence_repair_condition", "If this is a repair, how bad is the damage?", [
      "Not applicable / not a repair",
      "Minor",
      "Moderate",
      "Major",
      "Fence is falling or missing sections",
      "Not sure"
    ])
  ],
  Concrete: [
    createQuestion("concrete_project_type", "What type of concrete project is this?", [
      "Driveway",
      "Patio",
      "Walkway",
      "Slab or pad",
      "Other"
    ], "checkbox"),
    createQuestion("concrete_work_type", "What service do you need done?", [
      "New installation",
      "Replacement",
      "Repair or resurfacing",
      "Extension or addition",
      "Other"
    ]),
    createQuestion("concrete_material", "What material or finish do you want?", [
      "Standard concrete",
      "Stamped or decorative concrete",
      "Brick / stone",
      "Exposed aggregate or specialty finish",
      "Not sure"
    ]),
    createQuestion("concrete_scope", "About how big is the job?", [
      "Small (up to ~200 sq ft)",
      "Medium (~200-600 sq ft)",
      "Large (~600-1,500 sq ft)",
      "Very large (1,500+ sq ft)",
      "Not sure"
    ]),
    createQuestion("concrete_site_condition", "What is the condition of the site now?", [
      "Open and ready",
      "Existing concrete needs removal",
      "Dirt or grading needed",
      "Tight or difficult access",
      "Not sure"
    ])
  ],
  "Deck Installation / Repair": [
    createQuestion("deck_work_type", "What service do you need done?", [
      "New deck",
      "Replace existing deck",
      "Repair existing deck",
      "Stairs or railing work",
      "Other"
    ]),
    createQuestion("deck_material", "What deck material do you want?", [
      "Wood",
      "Composite",
      "PVC or premium material",
      "Other"
    ]),
    createQuestion("deck_scope", "About how large is the deck project?", [
      "Small (up to ~150 sq ft)",
      "Medium (~150-350 sq ft)",
      "Large (~350-700 sq ft)",
      "Multi-level or very large (700+ sq ft)",
      "Not sure"
    ]),
    createQuestion("deck_area_type", "What type of work area is it?", [
      "Ground level",
      "Raised deck",
      "Multi-level",
      "Rooftop or specialty area",
      "Not sure"
    ]),
    createQuestion("deck_repair_condition", "If this is a repair, what condition is the deck in?", [
      "Not applicable / not a repair",
      "Minor issues",
      "Some damaged boards",
      "Structural concerns",
      "Major deterioration",
      "Not sure"
    ])
  ],
  "Exterior Painting": [
    createQuestion("painting_target", "What needs to be painted?", [
      "Full house exterior",
      "Partial exterior",
      "Trim, doors, or garage only",
      "Fence or detached structure",
      "Other"
    ]),
    createQuestion("painting_surface_type", "What type of surface is being painted?", [
      "Stucco",
      "Wood",
      "Siding",
      "Brick or masonry",
      "Other"
    ]),
    createQuestion("painting_condition", "What is the current condition of the surface?", [
      "Good condition",
      "Minor peeling or wear",
      "Heavy peeling or damage",
      "Needs prep and repairs",
      "Not sure"
    ]),
    createQuestion("painting_scope", "What is the size of the job?", [
      "Small touch-up",
      "One side or small area",
      "Most of exterior",
      "Full exterior",
      "Not sure"
    ]),
    createQuestion("painting_access", "How difficult is access?", [
      "Easy",
      "Two-story areas",
      "Steep or hard-to-reach areas",
      "Tight access",
      "Not sure"
    ])
  ],
  Roofing: [
    createQuestion("roofing_work_type", "What type of roofing work do you need?", [
      "Minor repair",
      "Leak repair",
      "Partial replacement",
      "Full roof replacement",
      "Other"
    ]),
    createQuestion("roofing_type", "What type of roof is it?", [
      "Shingle",
      "Tile",
      "Metal",
      "Flat roof",
      "Other"
    ]),
    createQuestion("roofing_problem", "What best describes the problem?", [
      "Missing or damaged area",
      "Leak or water issue",
      "Old roof needing replacement",
      "Storm or major damage",
      "Other"
    ]),
    createQuestion("roofing_scope", "About how much of the roof is involved?", [
      "Small section",
      "One area or slope",
      "Large portion",
      "Entire roof",
      "Not sure"
    ]),
    createQuestion("roofing_access", "How easy is roof access?", [
      "Easy",
      "Moderate",
      "Steep or difficult",
      "Very difficult",
      "Not sure"
    ])
  ],
  "Junk Removal": [
    createQuestion("junk_type", "What needs to be removed?", [
      "Household junk",
      "Furniture",
      "Yard debris",
      "Construction debris",
      "Other"
    ]),
    createQuestion("junk_amount", "How much junk is there?", [
      "A few items (fits in part of a pickup bed)",
      "Small load (about a pickup load)",
      "Medium load (about half a trailer or small truck)",
      "Large load (about a full trailer or truck load+)",
      "Not sure"
    ]),
    createQuestion("junk_location", "Where is the junk located?", [
      "Curbside",
      "Garage or driveway",
      "Inside the home",
      "Backyard or hard-to-reach area",
      "Other"
    ]),
    createQuestion("junk_heavy_items", "Are there any heavy or difficult items?", [
      "No",
      "Yes, a few",
      "Yes, many",
      "Not sure"
    ])
  ],
  "Outdoor Lighting Installation": [
    createQuestion("lighting_work_type", "What do you need help with?", [
      "Install lights I already have",
      "Install a basic new lighting setup",
      "Install a full new lighting system",
      "Add to an existing system",
      "Repair existing lighting",
      "Other"
    ]),
    createQuestion("lighting_type", "What kind of lighting is this for?", [
      "Pathway lights",
      "Driveway lights",
      "Accent or landscape lights",
      "Patio or string lights",
      "Security or flood lights",
      "Other"
    ], "checkbox"),
    createQuestion("lighting_scope", "How much of the property needs lighting work?", [
      "One small area",
      "One medium-sized area",
      "One large area",
      "Multiple areas",
      "Not sure"
    ]),
    createQuestion("lighting_power", "Is power already available where the lighting is needed?", [
      "Yes",
      "Partly",
      "No",
      "Not sure"
    ]),
    createQuestion("lighting_install_difficulty", "What best describes the installation difficulty?", [
      "Easy access, simple install",
      "Some wiring or layout work needed",
      "New wiring or trenching likely needed",
      "Complex or large-property installation",
      "Not sure"
    ])
  ],
  Other: [
    createQuestion("other_outdoor_service", "Is this an outdoor service?", [
      "Yes",
      "No"
    ]),
    createQuestion("other_work_type", "What kind of project do you need help with?", [
      "Cleaning",
      "Repair",
      "Installation",
      "Removal",
      "Other"
    ]),
    createQuestion("other_size", "What size is the project?", [
      "Small",
      "Medium",
      "Large",
      "Very large",
      "Not sure"
    ]),
    createQuestion("other_property_type", "What type of property is this for?", [
      "Standard home",
      "Large home",
      "Multi-unit property",
      "Commercial property",
      "Not sure"
    ]),
    createQuestion("other_access", "How easy is access to the work area?", [
      "Easy",
      "Moderate",
      "Difficult",
      "Very difficult",
      "Not sure"
    ])
  ]
};
