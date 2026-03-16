export function enforceServerOnly() {
  const shouldGuard = Boolean(
    process.env.NEXT_RUNTIME ||
      process.env.NEXT_PHASE ||
      process.env.VERCEL ||
      process.env.NODE_ENV === "production"
  );

  if (!shouldGuard) {
    return;
  }

  try {
    require("server-only");
  } catch {
    // Allow non-Next script entrypoints to reuse server modules locally.
  }
}
