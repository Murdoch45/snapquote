import "server-only";

import { startOfDay, subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCurrency } from "@/lib/utils";
import {
  DEMO_BUSINESS_NAME,
  DEMO_LOCATION_LABEL,
  DEMO_ORG_SLUG,
  DEMO_OWNER_NAME,
  DEMO_PLAN,
  DEMO_USER_EMAIL,
  DemoAcceptancePoint,
  DemoApiResponse,
  DemoCustomerItem,
  DemoLeadItem,
  DemoMemberItem,
  DemoPageId,
  DemoQuoteItem,
  DemoServiceBreakdownItem,
  DemoTrendPoint,
  demoPageLabels,
  getPlanDisplayName,
  getPlanMonthlyCredits,
  getPlanPriceLabel,
  getPlanSeatLimit
} from "@/lib/demo/shared";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan: "SOLO" | "TEAM" | "BUSINESS";
  monthly_credits: number | null;
  bonus_credits: number | null;
};

type ContractorProfileRow = {
  business_name: string;
  public_slug: string;
  phone: string | null;
  email: string | null;
  business_address_full: string | null;
  quote_sms_template: string | null;
  services: string[] | null;
  social_caption: string | null;
};

type LeadRow = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  address_full: string;
  job_city: string | null;
  job_state: string | null;
  services: string[] | null;
  submitted_at: string;
  status: string;
  ai_job_summary: string | null;
  ai_estimate_low: number | null;
  ai_estimate_high: number | null;
  ai_suggested_price: number | null;
};

type QuoteLeadRelation = {
  address_full: string;
  job_city: string | null;
  job_state: string | null;
  services: string[] | null;
  customer_name: string | null;
  submitted_at: string | null;
};

type QuoteRow = {
  id: string;
  public_id: string;
  status: string;
  price: number | string | null;
  estimated_price_low: number | string | null;
  estimated_price_high: number | string | null;
  sent_at: string;
  viewed_at: string | null;
  accepted_at: string | null;
  lead: QuoteLeadRelation | QuoteLeadRelation[] | null;
};

type PhotoRow = {
  lead_id: string;
};

type UnlockRow = {
  lead_id: string;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
};

type DemoDataset = {
  org: OrganizationRow;
  profile: ContractorProfileRow;
  shell: DemoApiResponse["shell"];
  leads: DemoLeadItem[];
  quotes: DemoQuoteItem[];
  customers: DemoCustomerItem[];
  members: DemoMemberItem[];
  invites: InviteRow[];
  metrics: Array<{ title: string; value: string; subtext?: string }>;
  leadsOverTime: DemoTrendPoint[];
  quotesOverTime: DemoTrendPoint[];
  acceptanceRateOverTime: DemoAcceptancePoint[];
  servicesBreakdown: DemoServiceBreakdownItem[];
  averageResponseMinutes: number;
};

function makeDateMap(days = 30): Record<string, number> {
  const map: Record<string, number> = {};
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = startOfDay(subDays(new Date(), index)).toISOString().slice(0, 10);
    map[date] = 0;
  }
  return map;
}

function formatCityState(city: string | null, state: string | null, address: string): string {
  if (city && state) return `${city}, ${state}`;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[1]}, ${parts[2].split(" ")[0]}`;
  }
  return DEMO_LOCATION_LABEL;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toLeadItem(
  lead: LeadRow,
  photoCountByLeadId: Record<string, number>,
  unlockedLeadIds: Set<string>
): DemoLeadItem {
  return {
    id: lead.id,
    customerName: lead.customer_name,
    customerPhone: lead.customer_phone,
    customerEmail: lead.customer_email,
    services: (lead.services ?? []).filter(Boolean),
    addressFull: lead.address_full,
    cityState: formatCityState(lead.job_city, lead.job_state, lead.address_full),
    submittedAt: lead.submitted_at,
    status: lead.status,
    aiEstimateLow: toNumber(lead.ai_estimate_low),
    aiEstimateHigh: toNumber(lead.ai_estimate_high),
    aiSuggestedPrice: toNumber(lead.ai_suggested_price),
    aiJobSummary: lead.ai_job_summary,
    photoCount: photoCountByLeadId[lead.id] ?? 0,
    isUnlocked: unlockedLeadIds.has(lead.id)
  };
}

function averageApprovalCycleDays(quotes: DemoQuoteItem[]): string {
  const diffs = quotes
    .filter((quote) => quote.acceptedAt)
    .map((quote) => {
      const sent = new Date(quote.sentAt).getTime();
      const accepted = new Date(quote.acceptedAt as string).getTime();
      return accepted > sent ? (accepted - sent) / 86400000 : null;
    })
    .filter((value): value is number => value !== null);

  if (diffs.length === 0) return "Same day";
  const average = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  return average < 1 ? "Same day" : `${average.toFixed(1)} days`;
}

function buildMetrics(
  leads: DemoLeadItem[],
  quotes: DemoQuoteItem[],
  acceptedCount: number,
  averageResponseMinutes: number
) {
  const totalQuoteValue = quotes.reduce((sum, quote) => sum + (quote.price ?? 0), 0);
  const averageQuoteValue = quotes.length > 0 ? totalQuoteValue / quotes.length : 0;
  const acceptanceRate = quotes.length > 0 ? (acceptedCount / quotes.length) * 100 : 0;

  return [
    {
      title: "Total leads (30d)",
      value: String(leads.length)
    },
    {
      title: "Estimates sent (30d)",
      value: String(quotes.length)
    },
    {
      title: "Estimates accepted",
      value: String(acceptedCount)
    },
    {
      title: "Acceptance rate",
      value: `${acceptanceRate.toFixed(1)}%`
    },
    {
      title: "Avg estimate value",
      value: toCurrency(averageQuoteValue)
    },
    {
      title: "Avg response time",
      value: `${averageResponseMinutes.toFixed(1)} min`
    }
  ];
}

function buildAnalytics(
  leads: DemoLeadItem[],
  quotes: DemoQuoteItem[]
): {
  leadsOverTime: DemoTrendPoint[];
  quotesOverTime: DemoTrendPoint[];
  acceptanceRateOverTime: DemoAcceptancePoint[];
  servicesBreakdown: DemoServiceBreakdownItem[];
  averageResponseMinutes: number;
} {
  const leadByDay = makeDateMap(30);
  const quoteByDay = makeDateMap(30);
  const acceptedByDay = makeDateMap(30);
  const servicesCount: Record<string, number> = {};

  for (const lead of leads) {
    const day = new Date(lead.submittedAt).toISOString().slice(0, 10);
    if (leadByDay[day] !== undefined) {
      leadByDay[day] += 1;
    }

    for (const service of lead.services) {
      servicesCount[service] = (servicesCount[service] ?? 0) + 1;
    }
  }

  const responseDiffs: number[] = [];

  for (const quote of quotes) {
    const sentDay = new Date(quote.sentAt).toISOString().slice(0, 10);
    if (quoteByDay[sentDay] !== undefined) {
      quoteByDay[sentDay] += 1;
    }

    if (quote.acceptedAt) {
      const acceptedDay = new Date(quote.acceptedAt).toISOString().slice(0, 10);
      if (acceptedByDay[acceptedDay] !== undefined) {
        acceptedByDay[acceptedDay] += 1;
      }
    }
  }

  for (const quote of quotes) {
    const linkedLead = leads.find((lead) => lead.addressFull === quote.addressFull && lead.customerName === quote.customerName);
    if (!linkedLead) continue;
    const diff = new Date(quote.sentAt).getTime() - new Date(linkedLead.submittedAt).getTime();
    if (diff > 0) {
      responseDiffs.push(diff / 60000);
    }
  }

  const acceptanceRateOverTime = Object.keys(quoteByDay).map((date) => {
    const sent = quoteByDay[date];
    const accepted = acceptedByDay[date] ?? 0;
    return {
      date,
      rate: sent === 0 ? 0 : Number(((accepted / sent) * 100).toFixed(1))
    };
  });

  return {
    leadsOverTime: Object.entries(leadByDay).map(([date, count]) => ({ date, count })),
    quotesOverTime: Object.entries(quoteByDay).map(([date, count]) => ({ date, count })),
    acceptanceRateOverTime,
    servicesBreakdown: Object.entries(servicesCount)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value),
    averageResponseMinutes:
      responseDiffs.length > 0
        ? Number((responseDiffs.reduce((sum, value) => sum + value, 0) / responseDiffs.length).toFixed(1))
        : 0
  };
}

function buildRequestLink(publicSlug: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${appUrl}/${publicSlug}`;
}

async function getDemoOrgId(): Promise<string> {
  const configuredOrgId = process.env.DEMO_ORG_ID?.trim();
  if (configuredOrgId) return configuredOrgId;

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", DEMO_ORG_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to resolve demo org: ${error.message}`);
  }

  if (org?.id) {
    return org.id as string;
  }

  throw new Error("Missing DEMO_ORG_ID. Run npm run seed:demo and add DEMO_ORG_ID to .env.local.");
}

async function fetchMembers(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<DemoMemberItem[]> {
  const { data: members, error } = await admin
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load demo team members: ${error.message}`);
  }

  const memberRows = (members ?? []) as MemberRow[];
  return Promise.all(
    memberRows.map(async (member) => {
      const userResult = await admin.auth.admin.getUserById(member.user_id);
      const user = userResult.data.user;
      const fullName =
        typeof user?.user_metadata?.full_name === "string"
          ? (user.user_metadata.full_name as string)
          : null;

      return {
        id: member.user_id,
        name: fullName ?? DEMO_OWNER_NAME,
        email: user?.email ?? DEMO_USER_EMAIL,
        role: member.role,
        createdAt: member.created_at
      };
    })
  );
}

async function loadDataset(): Promise<DemoDataset> {
  const admin = createAdminClient();
  const orgId = await getDemoOrgId();

  const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const [
    { data: org, error: orgError },
    { data: profile, error: profileError },
    { data: leads, error: leadsError },
    { data: photos, error: photosError },
    { data: unlocks, error: unlocksError },
    { data: quotes, error: quotesError },
    { data: customers, error: customersError },
    { data: invites, error: invitesError },
    { data: usage }
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id,name,slug,plan,monthly_credits,bonus_credits")
      .eq("id", orgId)
      .single(),
    admin
      .from("contractor_profile")
      .select(
        "business_name,public_slug,phone,email,business_address_full,quote_sms_template,services,social_caption"
      )
      .eq("org_id", orgId)
      .single(),
    admin
      .from("leads")
      .select(
        "id,customer_name,customer_phone,customer_email,address_full,job_city,job_state,services,submitted_at,status,ai_job_summary,ai_estimate_low,ai_estimate_high,ai_suggested_price"
      )
      .eq("org_id", orgId)
      .eq("ai_status", "ready")
      .order("submitted_at", { ascending: false }),
    admin.from("lead_photos").select("lead_id").eq("org_id", orgId),
    admin.from("lead_unlocks").select("lead_id").eq("org_id", orgId),
    admin
      .from("quotes")
      .select(
        "id,public_id,status,price,estimated_price_low,estimated_price_high,sent_at,viewed_at,accepted_at,lead:leads(address_full,job_city,job_state,services,customer_name,submitted_at)"
      )
      .eq("org_id", orgId)
      .order("sent_at", { ascending: false }),
    admin
      .from("customers")
      .select("id,name,phone,email,created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    admin
      .from("pending_invites")
      .select("id,email,role,created_at")
      .eq("org_id", orgId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false }),
    admin
      .from("org_usage_monthly")
      .select("quotes_sent_count")
      .eq("org_id", orgId)
      .eq("month", currentMonth)
      .maybeSingle()
  ]);

  if (orgError || !org) {
    throw new Error(`Unable to load demo organization: ${orgError?.message ?? "Missing organization."}`);
  }

  if (profileError || !profile) {
    throw new Error(`Unable to load demo contractor profile: ${profileError?.message ?? "Missing profile."}`);
  }

  if (leadsError) {
    throw new Error(`Unable to load demo leads: ${leadsError.message}`);
  }

  if (photosError) {
    throw new Error(`Unable to load demo lead photos: ${photosError.message}`);
  }

  if (unlocksError) {
    throw new Error(`Unable to load demo lead unlocks: ${unlocksError.message}`);
  }

  if (quotesError) {
    throw new Error(`Unable to load demo quotes: ${quotesError.message}`);
  }

  if (customersError) {
    throw new Error(`Unable to load demo customers: ${customersError.message}`);
  }

  if (invitesError) {
    throw new Error(`Unable to load demo invites: ${invitesError.message}`);
  }

  const photoCountByLeadId = ((photos ?? []) as PhotoRow[]).reduce<Record<string, number>>((counts, row) => {
    counts[row.lead_id] = (counts[row.lead_id] ?? 0) + 1;
    return counts;
  }, {});

  const unlockedLeadIds = new Set(((unlocks ?? []) as UnlockRow[]).map((row) => row.lead_id));
  const demoLeads = ((leads ?? []) as LeadRow[]).map((lead) =>
    toLeadItem(lead, photoCountByLeadId, unlockedLeadIds)
  );

  const demoQuotes = ((quotes ?? []) as QuoteRow[]).map((quote) => {
    const relation = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
    const addressFull = relation?.address_full ?? "Address unavailable";

    return {
      id: quote.id,
      publicId: quote.public_id,
      customerName: relation?.customer_name ?? "Customer",
      services: (relation?.services ?? []).filter(Boolean),
      addressFull,
      cityState: formatCityState(relation?.job_city ?? null, relation?.job_state ?? null, addressFull),
      status: quote.status,
      price: toNumber(quote.price),
      estimatedPriceLow: toNumber(quote.estimated_price_low),
      estimatedPriceHigh: toNumber(quote.estimated_price_high),
      sentAt: quote.sent_at,
      viewedAt: quote.viewed_at,
      acceptedAt: quote.accepted_at
    } satisfies DemoQuoteItem;
  });

  const analytics = buildAnalytics(demoLeads, demoQuotes);
  const acceptedCount = demoQuotes.filter((quote) => quote.status === "ACCEPTED").length;
  const metrics = buildMetrics(demoLeads, demoQuotes, acceptedCount, analytics.averageResponseMinutes);
  const members = await fetchMembers(admin, orgId);
  const owner = members[0];
  const totalCredits = Number(org.monthly_credits ?? 0) + Number(org.bonus_credits ?? 0);

  return {
    org: org as OrganizationRow,
    profile: profile as ContractorProfileRow,
    shell: {
      businessName: profile.business_name,
      ownerName: owner?.name ?? DEMO_OWNER_NAME,
      ownerEmail: owner?.email ?? profile.email ?? DEMO_USER_EMAIL,
      location: profile.business_address_full ?? DEMO_LOCATION_LABEL,
      publicSlug: profile.public_slug,
      plan: (org.plan as OrganizationRow["plan"]) ?? DEMO_PLAN,
      planLabel: getPlanDisplayName((org.plan as OrganizationRow["plan"]) ?? DEMO_PLAN),
      pageTitle: demoPageLabels.dashboard,
      totalCredits,
      requestLink: buildRequestLink(profile.public_slug)
    },
    leads: demoLeads,
    quotes: demoQuotes,
    customers: ((customers ?? []) as CustomerRow[]).map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.created_at
    })),
    members,
    invites: (invites ?? []) as InviteRow[],
    metrics,
    leadsOverTime: analytics.leadsOverTime,
    quotesOverTime: analytics.quotesOverTime,
    acceptanceRateOverTime: analytics.acceptanceRateOverTime,
    servicesBreakdown: analytics.servicesBreakdown,
    averageResponseMinutes: analytics.averageResponseMinutes
  };
}

export async function getDemoPageData(page: DemoPageId): Promise<DemoApiResponse> {
  const dataset = await loadDataset();
  const plan = dataset.org.plan ?? DEMO_PLAN;
  const monthlyCreditsRemaining = Number(dataset.org.monthly_credits ?? 0);
  const bonusCredits = Number(dataset.org.bonus_credits ?? 0);
  const totalCredits = monthlyCreditsRemaining + bonusCredits;
  const shell = {
    ...dataset.shell,
    pageTitle: demoPageLabels[page],
    totalCredits
  };

  if (page === "dashboard") {
    const recentLeads = dataset.leads.slice(0, 5);
    const viewedCount = dataset.quotes.filter((quote) => quote.status === "VIEWED").length;
    const sentCount = dataset.quotes.filter((quote) => quote.status === "SENT").length;
    const acceptedCount = dataset.quotes.filter((quote) => quote.status === "ACCEPTED").length;

    return {
      page,
      shell,
      payload: {
        metrics: dataset.metrics,
        recentLeads,
        statusSummary: [
          { label: "Awaiting review", value: String(sentCount + viewedCount) },
          { label: "Accepted jobs", value: String(acceptedCount) },
          { label: "Credits available", value: String(totalCredits) }
        ],
        serviceBreakdown: dataset.servicesBreakdown.slice(0, 5)
      }
    };
  }

  if (page === "leads") {
    return {
      page,
      shell,
      payload: {
        creditsRemaining: totalCredits,
        leads: dataset.leads
      }
    };
  }

  if (page === "quotes") {
    const awaitingApprovalCount = dataset.quotes.filter(
      (quote) => quote.status === "SENT" || quote.status === "VIEWED"
    ).length;

    return {
      page,
      shell,
      payload: {
        quotes: dataset.quotes,
        awaitingApprovalCount,
        acceptedCount: dataset.quotes.filter((quote) => quote.status === "ACCEPTED").length,
        avgApprovalCycleDays: averageApprovalCycleDays(dataset.quotes)
      }
    };
  }

  if (page === "customers") {
    return {
      page,
      shell,
      payload: {
        customers: dataset.customers
      }
    };
  }

  if (page === "analytics") {
    return {
      page,
      shell,
      payload: {
        metrics: dataset.metrics,
        leadsOverTime: dataset.leadsOverTime,
        quotesOverTime: dataset.quotesOverTime,
        acceptanceRateOverTime: dataset.acceptanceRateOverTime,
        servicesBreakdown: dataset.servicesBreakdown
      }
    };
  }

  if (page === "my-link") {
    return {
      page,
      shell,
      payload: {
        requestLink: dataset.shell.requestLink,
        socialCaption:
          dataset.profile.social_caption ??
          `Need an estimate? ${dataset.profile.business_name} makes it easy - just fill out a quick form and we'll get back to you as soon as possible. ${dataset.shell.requestLink}`,
        monthlyRequests: dataset.leads.length,
        avgResponseMinutes: dataset.averageResponseMinutes,
        previewMetrics: [
          { label: "Public requests this month", value: String(dataset.leads.length) },
          { label: "Estimates sent", value: String(dataset.quotes.length) },
          { label: "Average response", value: `${dataset.averageResponseMinutes.toFixed(1)} min` }
        ]
      }
    };
  }

  if (page === "plan") {
    return {
      page,
      shell,
      payload: {
        planLabel: getPlanDisplayName(plan),
        priceLabel: getPlanPriceLabel(plan),
        monthlyCreditsRemaining,
        monthlyCreditsLimit: getPlanMonthlyCredits(plan),
        bonusCredits,
        totalCredits,
        creditsResetLabel: null,
        seatsUsed: dataset.members.length,
        seatsLimit: getPlanSeatLimit(plan),
        highlights: [
          `${getPlanMonthlyCredits(plan)} monthly lead credits`,
          `${getPlanSeatLimit(plan)} team seats`,
          "Billing is active for the demo workspace"
        ]
      }
    };
  }

  if (page === "team") {
    return {
      page,
      shell,
      payload: {
        members: dataset.members,
        invites: dataset.invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          createdAt: invite.created_at
        })),
        seatsUsed: dataset.members.length,
        seatsLimit: getPlanSeatLimit(plan)
      }
    };
  }

  return {
    page,
    shell,
    payload: {
      businessName: dataset.profile.business_name || DEMO_BUSINESS_NAME,
      publicSlug: dataset.profile.public_slug,
      phone: dataset.profile.phone,
      email: dataset.profile.email,
      businessAddress: dataset.profile.business_address_full,
      enabledServices: (dataset.profile.services ?? []).filter(Boolean),
      notifications: [
        "Lead notifications by SMS",
        "Lead notifications by email",
        "Acceptance notifications by SMS"
      ],
      quoteSmsTemplate: dataset.profile.quote_sms_template
    }
  };
}
