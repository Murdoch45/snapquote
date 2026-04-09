"use client";

type Provider = "google" | "apple";

type OAuthButtonsProps = {
  googleLabel: string;
  appleLabel: string;
  loadingProvider: Provider | null;
  onProviderClick: (provider: Provider) => void;
};

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px]"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.806.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5832-5.036-3.7104H.9573v2.3318C2.4382 15.9831 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8269.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 17"
      className="h-[17px] w-[14px] fill-white"
    >
      <path d="M11.624 8.945c-.02-2.022 1.65-2.99 1.726-3.038-.94-1.376-2.404-1.564-2.926-1.585-1.247-.126-2.434.733-3.067.733-.633 0-1.61-.715-2.65-.694-1.363.02-2.62.792-3.318 2.012-1.415 2.452-.362 6.078 1.018 8.067.674.971 1.476 2.062 2.527 2.024 1.014-.04 1.397-.656 2.622-.656 1.226 0 1.57.656 2.643.633 1.091-.02 1.783-.99 2.45-1.967.772-1.13 1.09-2.225 1.108-2.282-.024-.011-2.124-.815-2.146-3.232-.018-2.022 1.65-2.99 1.727-3.038m-2.025-5.59C10.156 2.677 10.535 1.74 10.43.8 9.625.834 8.65 1.34 8.073 2.014c-.516.598-.969 1.553-.847 2.475.9.07 1.815-.457 2.373-1.135" />
    </svg>
  );
}

export function OAuthButtons({
  googleLabel,
  appleLabel,
  loadingProvider,
  onProviderClick
}: OAuthButtonsProps) {
  const disabled = loadingProvider !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-3">
        {/* Apple Sign-In button — follows Apple Human Interface Guidelines:
            black background, white Apple logo, white SF-equivalent system text. */}
        <button
          type="button"
          onClick={() => onProviderClick("apple")}
          disabled={disabled}
          aria-label={appleLabel}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 font-medium text-white transition-colors hover:bg-[#1f1f1f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            fontFamily:
              '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif',
            fontSize: "15px"
          }}
        >
          <AppleLogo />
          <span>{loadingProvider === "apple" ? "Redirecting..." : appleLabel}</span>
        </button>

        {/* Google Sign-In button — follows Google brand guidelines:
            white background, #747775 border, full-color G logo,
            14px Roboto-equivalent system font, 40px+ height. */}
        <button
          type="button"
          onClick={() => onProviderClick("google")}
          disabled={disabled}
          aria-label={googleLabel}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 font-medium text-[#1f1f1f] transition-colors hover:bg-[#f8f9fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ fontFamily: '"Roboto","Helvetica Neue",Arial,sans-serif', fontSize: "14px", letterSpacing: "0.25px" }}
        >
          <GoogleLogo />
          <span>{loadingProvider === "google" ? "Redirecting..." : googleLabel}</span>
        </button>
      </div>
    </div>
  );
}
