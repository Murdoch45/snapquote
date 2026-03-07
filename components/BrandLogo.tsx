import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
};

const sizeClasses = {
  sm: {
    wrapper: "gap-2",
    icon: "h-9 w-11",
    wordmark: "text-xl"
  },
  md: {
    wrapper: "gap-3",
    icon: "h-12 w-14",
    wordmark: "text-3xl"
  },
  lg: {
    wrapper: "gap-4",
    icon: "h-16 w-20",
    wordmark: "text-[2.75rem]"
  }
} as const;

export function BrandLogo({
  size = "md",
  className,
  iconClassName,
  wordmarkClassName
}: BrandLogoProps) {
  const sizing = sizeClasses[size];

  return (
    <div className={cn("inline-flex items-center", sizing.wrapper, className)}>
      <svg
        viewBox="0 0 104 92"
        aria-hidden="true"
        className={cn("shrink-0", sizing.icon, iconClassName)}
      >
        <defs>
          <linearGradient id="snapquote-bubble" x1="12" y1="12" x2="88" y2="80">
            <stop offset="0%" stopColor="#3FA1F7" />
            <stop offset="100%" stopColor="#174BB7" />
          </linearGradient>
        </defs>
        <path
          d="M29 12H76C89.255 12 100 22.745 100 36C100 49.255 89.255 60 76 60H46L24 78V60.5C16.69 58.4 10 51.06 10 40V36C10 22.745 15.745 12 29 12Z"
          fill="url(#snapquote-bubble)"
        />
        <path
          d="M45 13H70L61 26H34Z"
          fill="#D6E3F2"
          opacity="0.95"
        />
        <path
          d="M50.5 18L35 48H51L42 71L75 36H59L68 18H50.5Z"
          fill="white"
        />
      </svg>
      <span
        className={cn(
          "font-extrabold tracking-tight text-[#1557B6]",
          sizing.wordmark,
          wordmarkClassName
        )}
      >
        SnapQuote
      </span>
    </div>
  );
}
