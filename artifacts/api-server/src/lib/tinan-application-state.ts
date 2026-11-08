const embeddedBuildId = process.env.TINANAI_BUILD_ID;
/** Public metadata only: never spread environment variables into a response. */
export function applicationIdentity(env: Record<string, string | undefined> = process.env) {
  const environment = env.NODE_ENV === "production" ? "production"
    : env.NODE_ENV === "development" ? "development" : "unknown";
  const candidate = env === process.env ? embeddedBuildId : env.TINANAI_BUILD_ID;
  return { environment, buildId: candidate && /^[a-f0-9]{7,40}(?:-dirty)?@[0-9TZ:.+-]+$/i.test(candidate) ? candidate : null };
}
