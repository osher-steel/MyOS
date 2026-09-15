// RUNTIME_ENV is stamped by src/load-env.ts before any other module
// initializes. Functions, not consts, so tests can toggle it.
export type RuntimeEnvironment = "production" | "local";

export function runtimeEnvironment(): RuntimeEnvironment {
  return (process.env.RUNTIME_ENV as RuntimeEnvironment) ?? "local";
}

export function isProduction(): boolean {
  return runtimeEnvironment() === "production";
}
