import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, readRootJson, REPO_ROOT } from "./env";

const TOKEN_FILE = ".spotify_tokens.json";

type TokenCache = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // seconds since epoch
};

export type Track = { title: string; artists: string; playedAt?: string };
export type Artist = { name: string };

/**
 * Returns a live access token, refreshing against the same file the
 * spotify_pkce.py CLI writes. Spotify rotates refresh tokens on PKCE and may
 * omit the new one, so the previous value is carried forward.
 */
async function accessToken(): Promise<string> {
  const cache = readRootJson<TokenCache>(TOKEN_FILE);
  if (!cache) {
    throw new Error("Not logged in — run ./spotify_pkce.py login at the repo root");
  }
  if (cache.expires_at > Date.now() / 1000) {
    return cache.access_token;
  }
  if (!cache.refresh_token) {
    throw new Error("Spotify token expired and no refresh token — run login again");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cache.refresh_token,
      client_id: env("SPOTIFY_CLIENT_ID"),
    }),
  });
  if (!res.ok) {
    throw new Error(`Spotify refresh ${res.status}: ${await res.text()}`);
  }

  const fresh = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const next: TokenCache = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? cache.refresh_token,
    expires_at: Date.now() / 1000 + fresh.expires_in - 60,
  };
  writeFileSync(join(REPO_ROOT, TOKEN_FILE), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next.access_token;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Spotify ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

type TrackObject = { name: string; artists: Array<{ name: string }> };

export async function getRecentTracks(limit = 8): Promise<Track[]> {
  const data = await api<{ items: Array<{ track: TrackObject; played_at: string }> }>(
    `me/player/recently-played?limit=${limit}`,
  );
  return data.items.map(({ track, played_at }) => ({
    title: track.name,
    artists: track.artists.map((a) => a.name).join(", "),
    playedAt: played_at,
  }));
}

export async function getTopArtists(limit = 8): Promise<Artist[]> {
  const data = await api<{ items: Array<{ name: string }> }>(
    `me/top/artists?limit=${limit}&time_range=medium_term`,
  );
  return data.items.map((artist) => ({ name: artist.name }));
}
