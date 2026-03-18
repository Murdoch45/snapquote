export type DemoView = "dashboard" | "leads" | "quotes" | "analytics" | "settings";

export type MetricTone = "cool" | "positive" | "neutral";

export type LeadStatus = "New" | "Quoted" | "Scheduled" | "Completed";

export type QuoteStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Accepted"
  | "Scheduled"
  | "Completed";

export type DemoMetric = {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
};

export type DemoLead = {
  customer: string;
  service: string;
  location: string;
  requestedAt: string;
  status: LeadStatus;
  suggestedQuote: number;
  photos: number;
};

export type DemoQuote = {
  quoteId: string;
  customer: string;
  service: string;
  location: string;
  amount: number;
  status: QuoteStatus;
  sentAt: string;
  nextStep: string;
};

export type DemoScheduleItem = {
  time: string;
  customer: string;
  service: string;
  crew: string;
  status: string;
};

export type DemoActivityItem = {
  title: string;
  detail: string;
  timestamp: string;
};

export type TrendPoint = {
  label: string;
  sent: number;
  won: number;
};

export type ServiceMixPoint = {
  service: string;
  share: number;
};

export type SettingsPanel = {
  title: string;
  description: string;
  items: string[];
};

export const overviewMetrics: DemoMetric[] = [
  {
    label: "Quotes Sent",
    value: "86",
    detail: "+14% vs last 30 days",
    tone: "cool"
  },
  {
    label: "Jobs Won",
    value: "41",
    detail: "48% close rate",
    tone: "positive"
  },
  {
    label: "Revenue",
    value: "$22.4k",
    detail: "Booked this month",
    tone: "cool"
  },
  {
    label: "Average Quote",
    value: "$278",
    detail: "11 min avg response",
    tone: "neutral"
  }
];

export const demoLeads: DemoLead[] = [
  {
    customer: "John Martinez",
    service: "Pressure Washing",
    location: "Austin, TX",
    requestedAt: "12 min ago",
    status: "New",
    suggestedQuote: 280,
    photos: 6
  },
  {
    customer: "Sarah Thompson",
    service: "Lawn Cleanup",
    location: "Plano, TX",
    requestedAt: "38 min ago",
    status: "Quoted",
    suggestedQuote: 140,
    photos: 4
  },
  {
    customer: "Mike Reynolds",
    service: "Gutter Cleaning",
    location: "Temecula, CA",
    requestedAt: "1 hr ago",
    status: "Scheduled",
    suggestedQuote: 175,
    photos: 7
  },
  {
    customer: "Emily Carter",
    service: "Window Cleaning",
    location: "Boise, ID",
    requestedAt: "2 hr ago",
    status: "New",
    suggestedQuote: 210,
    photos: 5
  },
  {
    customer: "Daniel Brooks",
    service: "Junk Removal",
    location: "Sacramento, CA",
    requestedAt: "3 hr ago",
    status: "Quoted",
    suggestedQuote: 360,
    photos: 9
  },
  {
    customer: "Maria Lopez",
    service: "Landscaping Refresh",
    location: "Scottsdale, AZ",
    requestedAt: "Yesterday",
    status: "Completed",
    suggestedQuote: 620,
    photos: 12
  },
  {
    customer: "Olivia Bennett",
    service: "Pool Service",
    location: "Mesa, AZ",
    requestedAt: "Yesterday",
    status: "New",
    suggestedQuote: 145,
    photos: 4
  },
  {
    customer: "Chris Walker",
    service: "Exterior Painting",
    location: "Fort Worth, TX",
    requestedAt: "Yesterday",
    status: "Scheduled",
    suggestedQuote: 1890,
    photos: 11
  }
];

export const demoQuotes: DemoQuote[] = [
  {
    quoteId: "SQ-2048",
    customer: "John Martinez",
    service: "Pressure Washing",
    location: "Austin, TX",
    amount: 280,
    status: "Sent",
    sentAt: "Today, 10:14 AM",
    nextStep: "Reminder tomorrow"
  },
  {
    quoteId: "SQ-2043",
    customer: "Sarah Thompson",
    service: "Lawn Cleanup",
    location: "Plano, TX",
    amount: 140,
    status: "Accepted",
    sentAt: "Today, 9:02 AM",
    nextStep: "Deposit received"
  },
  {
    quoteId: "SQ-2039",
    customer: "Mike Reynolds",
    service: "Gutter Cleaning",
    location: "Temecula, CA",
    amount: 175,
    status: "Scheduled",
    sentAt: "Yesterday, 5:21 PM",
    nextStep: "Friday 8:30 AM"
  },
  {
    quoteId: "SQ-2035",
    customer: "Emily Carter",
    service: "Window Cleaning",
    location: "Boise, ID",
    amount: 210,
    status: "Viewed",
    sentAt: "Yesterday, 4:12 PM",
    nextStep: "Awaiting approval"
  },
  {
    quoteId: "SQ-2031",
    customer: "Daniel Brooks",
    service: "Junk Removal",
    location: "Sacramento, CA",
    amount: 360,
    status: "Sent",
    sentAt: "Yesterday, 2:46 PM",
    nextStep: "Text follow-up queued"
  },
  {
    quoteId: "SQ-2028",
    customer: "Maria Lopez",
    service: "Landscaping Refresh",
    location: "Scottsdale, AZ",
    amount: 620,
    status: "Completed",
    sentAt: "Mon, 1:18 PM",
    nextStep: "Closed won"
  },
  {
    quoteId: "SQ-2024",
    customer: "Chris Walker",
    service: "Exterior Painting",
    location: "Fort Worth, TX",
    amount: 1890,
    status: "Viewed",
    sentAt: "Mon, 10:07 AM",
    nextStep: "Site visit pending"
  }
];

export const todaySchedule: DemoScheduleItem[] = [
  {
    time: "8:00 AM",
    customer: "Olivia Bennett",
    service: "Pool Service",
    crew: "Crew North",
    status: "Arriving"
  },
  {
    time: "10:30 AM",
    customer: "Mike Reynolds",
    service: "Gutter Cleaning",
    crew: "Crew West",
    status: "On site"
  },
  {
    time: "1:15 PM",
    customer: "Chris Walker",
    service: "Exterior Painting",
    crew: "Sales visit",
    status: "18 min travel"
  },
  {
    time: "3:45 PM",
    customer: "Maria Lopez",
    service: "Landscaping Refresh",
    crew: "Crew Desert",
    status: "Proposal review"
  }
];

export const activityFeed: DemoActivityItem[] = [
  {
    title: "AI extracted surfaces and line items",
    detail: "John Martinez request marked ready to quote.",
    timestamp: "12 min ago"
  },
  {
    title: "Reminder queued for viewed quote",
    detail: "Emily Carter follow-up sends at 6:00 PM.",
    timestamp: "28 min ago"
  },
  {
    title: "Crew availability synced",
    detail: "Friday morning slot opened in Temecula.",
    timestamp: "1 hr ago"
  },
  {
    title: "Accepted quote moved to scheduled",
    detail: "Sarah Thompson cleanup added to tomorrow's route.",
    timestamp: "2 hr ago"
  }
];

export const quoteTrend: TrendPoint[] = [
  { label: "W1", sent: 12, won: 5 },
  { label: "W2", sent: 14, won: 6 },
  { label: "W3", sent: 15, won: 7 },
  { label: "W4", sent: 13, won: 6 },
  { label: "W5", sent: 16, won: 8 },
  { label: "W6", sent: 16, won: 9 }
];

export const serviceMix: ServiceMixPoint[] = [
  { service: "Pressure Washing", share: 28 },
  { service: "Landscaping", share: 19 },
  { service: "Lawn Care", share: 15 },
  { service: "Gutter Cleaning", share: 12 },
  { service: "Window Cleaning", share: 10 },
  { service: "Junk Removal", share: 9 },
  { service: "Exterior Painting", share: 5 },
  { service: "Pool Service", share: 2 }
];

export const settingsPanels: SettingsPanel[] = [
  {
    title: "Business profile",
    description: "Blue Ridge Outdoor Services",
    items: [
      "Primary area: Austin metro plus 25 miles",
      "Quote turnaround target: under 15 minutes",
      "Office hours: Mon-Sat, 7:00 AM to 6:00 PM"
    ]
  },
  {
    title: "Automations",
    description: "Stay responsive without extra admin",
    items: [
      "Instant text acknowledgement enabled",
      "AI service detection for intake photos",
      "Two reminder nudges before quote expiry"
    ]
  },
  {
    title: "Services",
    description: "Configured for everyday outdoor work",
    items: [
      "Pressure washing, landscaping, lawn care",
      "Gutter cleaning, window cleaning, junk removal",
      "Exterior painting and pool service"
    ]
  },
  {
    title: "Quote preferences",
    description: "Guardrails for faster approvals",
    items: [
      "Suggested pricing ranges surfaced on intake",
      "Approval threshold set above $1,500",
      "Seven-day quote validity with auto reminders"
    ]
  }
];
