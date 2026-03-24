type ServiceColor = {
  badgeClassName: string;
  style: {
    backgroundColor: string;
    color: string;
  };
  chartColor: string;
};

const DEFAULT_SERVICE_COLOR: ServiceColor = {
  badgeClassName: "border-transparent bg-[#F3F4F6] text-[#374151]",
  style: {
    backgroundColor: "#F3F4F6",
    color: "#374151"
  },
  chartColor: "#374151"
};

const SERVICE_COLORS: Array<{ match: RegExp; color: ServiceColor }> = [
  {
    match: /pressure washing/,
    color: {
      badgeClassName: "border-transparent bg-[#DBEAFE] text-[#1D4ED8]",
      style: { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
      chartColor: "#1D4ED8"
    }
  },
  {
    match: /gutter/,
    color: {
      badgeClassName: "border-transparent bg-[#E0F2FE] text-[#0369A1]",
      style: { backgroundColor: "#E0F2FE", color: "#0369A1" },
      chartColor: "#0369A1"
    }
  },
  {
    match: /window/,
    color: {
      badgeClassName: "border-transparent bg-[#CFFAFE] text-[#0E7490]",
      style: { backgroundColor: "#CFFAFE", color: "#0E7490" },
      chartColor: "#0E7490"
    }
  },
  {
    match: /pool/,
    color: {
      badgeClassName: "border-transparent bg-[#CCFBF1] text-[#0F766E]",
      style: { backgroundColor: "#CCFBF1", color: "#0F766E" },
      chartColor: "#0F766E"
    }
  },
  {
    match: /lawn care/,
    color: {
      badgeClassName: "border-transparent bg-[#DCFCE7] text-[#15803D]",
      style: { backgroundColor: "#DCFCE7", color: "#15803D" },
      chartColor: "#15803D"
    }
  },
  {
    match: /landscap/,
    color: {
      badgeClassName: "border-transparent bg-[#D1FAE5] text-[#065F46]",
      style: { backgroundColor: "#D1FAE5", color: "#065F46" },
      chartColor: "#065F46"
    }
  },
  {
    match: /tree/,
    color: {
      badgeClassName: "border-transparent bg-[#FEF3C7] text-[#92400E]",
      style: { backgroundColor: "#FEF3C7", color: "#92400E" },
      chartColor: "#92400E"
    }
  },
  {
    match: /roof/,
    color: {
      badgeClassName: "border-transparent bg-[#FEE2E2] text-[#B91C1C]",
      style: { backgroundColor: "#FEE2E2", color: "#B91C1C" },
      chartColor: "#B91C1C"
    }
  },
  {
    match: /concrete/,
    color: {
      badgeClassName: "border-transparent bg-[#E2E8F0] text-[#475569]",
      style: { backgroundColor: "#E2E8F0", color: "#475569" },
      chartColor: "#475569"
    }
  },
  {
    match: /fenc/,
    color: {
      badgeClassName: "border-transparent bg-[#FFEDD5] text-[#C2410C]",
      style: { backgroundColor: "#FFEDD5", color: "#C2410C" },
      chartColor: "#C2410C"
    }
  },
  {
    match: /deck/,
    color: {
      badgeClassName: "border-transparent bg-[#FEF9C3] text-[#854D0E]",
      style: { backgroundColor: "#FEF9C3", color: "#854D0E" },
      chartColor: "#854D0E"
    }
  },
  {
    match: /painting/,
    color: {
      badgeClassName: "border-transparent bg-[#F3E8FF] text-[#7E22CE]",
      style: { backgroundColor: "#F3E8FF", color: "#7E22CE" },
      chartColor: "#7E22CE"
    }
  },
  {
    match: /junk/,
    color: {
      badgeClassName: "border-transparent bg-[#F4F4F5] text-[#3F3F46]",
      style: { backgroundColor: "#F4F4F5", color: "#3F3F46" },
      chartColor: "#3F3F46"
    }
  },
  {
    match: /lighting/,
    color: {
      badgeClassName: "border-transparent bg-[#FEF08A] text-[#854D0E]",
      style: { backgroundColor: "#FEF08A", color: "#854D0E" },
      chartColor: "#854D0E"
    }
  },
  {
    match: /other/,
    color: {
      badgeClassName: "border-transparent bg-[#F3F4F6] text-[#374151]",
      style: { backgroundColor: "#F3F4F6", color: "#374151" },
      chartColor: "#374151"
    }
  }
];

export function getServiceColor(service: string | null | undefined): ServiceColor {
  const normalized = service?.trim().toLowerCase() ?? "";
  return SERVICE_COLORS.find((entry) => entry.match.test(normalized))?.color ?? DEFAULT_SERVICE_COLOR;
}

export function getServiceBadgeClassName(service: string | null | undefined): string {
  return getServiceColor(service).badgeClassName;
}

export function getServiceBadgeStyle(service: string | null | undefined): { backgroundColor: string; color: string } {
  return getServiceColor(service).style;
}

export function getServiceChartColor(service: string | null | undefined): string {
  return getServiceColor(service).chartColor;
}
