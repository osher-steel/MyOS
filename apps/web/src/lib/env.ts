import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Repo root — apps/web/../.. — where the shared .env and token caches live. */
export const REPO_ROOT = join(process.cwd(), "..", "..");

export function env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} in .env`);
  }
  return value;
}

/** Read a JSON file from the repo root, or null when it does not exist yet. */
export function readRootJson<T>(filename: string): T | null {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, filename), "utf8")) as T;
  } catch {
    return null;
  }
}
