#!/usr/bin/env python3
"""Spotify Authorization Code + PKCE flow, stdlib only.

Usage:
    ./spotify_pkce.py login              # browser round-trip, stores tokens
    ./spotify_pkce.py me                 # current user profile
    ./spotify_pkce.py top [tracks|artists]
    ./spotify_pkce.py recent
    ./spotify_pkce.py get <api-path>     # e.g. get "me/playlists?limit=5"
    ./spotify_pkce.py token              # print a valid access token
    ./spotify_pkce.py logout

Reads SPOTIFY_CLIENT_ID from .env. No client secret needed — that is the
point of PKCE, and why this flow is safe to run from a public client.
"""

import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
TOKEN_FILE = ROOT / ".spotify_tokens.json"

REDIRECT_HOST, REDIRECT_PORT = "127.0.0.1", 8888
REDIRECT_URI = f"http://{REDIRECT_HOST}:{REDIRECT_PORT}/callback"

AUTH_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1/"

SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-top-read",
    "user-read-recently-played",
    "user-read-playback-state",
    "playlist-read-private",
]


# --- env / token storage ----------------------------------------------------


def load_env():
    """Minimal .env reader — KEY=VALUE, ignores blanks and # comments."""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip("'\"")
    return env


def client_id():
    cid = os.environ.get("SPOTIFY_CLIENT_ID") or load_env().get("SPOTIFY_CLIENT_ID")
    if not cid:
        sys.exit("SPOTIFY_CLIENT_ID not found in environment or .env")
    return cid


def save_tokens(data):
    """Persist tokens, converting expires_in into an absolute deadline."""
    import time

    data = dict(data)
    data["expires_at"] = time.time() + data.pop("expires_in", 3600) - 60
    # PKCE rotates refresh tokens; a refresh response may omit it, so keep the old.
    if "refresh_token" not in data and TOKEN_FILE.exists():
        old = json.loads(TOKEN_FILE.read_text())
        if "refresh_token" in old:
            data["refresh_token"] = old["refresh_token"]
    TOKEN_FILE.write_text(json.dumps(data, indent=2))
    TOKEN_FILE.chmod(0o600)
    return data


def read_tokens():
    if not TOKEN_FILE.exists():
        sys.exit("Not logged in. Run: ./spotify_pkce.py login")
    return json.loads(TOKEN_FILE.read_text())


# --- HTTP helpers -----------------------------------------------------------


def post_form(url, fields):
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        sys.exit(f"Token request failed ({exc.code}): {exc.read().decode()}")


def api_get(path):
    token = valid_access_token()
    url = urllib.parse.urljoin(API_BASE, path.lstrip("/"))
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        sys.exit(f"GET {path} failed ({exc.code}): {exc.read().decode()}")


# --- PKCE -------------------------------------------------------------------


def b64url(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def make_verifier_and_challenge():
    verifier = b64url(secrets.token_bytes(64))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    """Single-shot handler that captures ?code= off the redirect."""

    result = {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_error(404)
            return
        params = urllib.parse.parse_qs(parsed.query)
        CallbackHandler.result = {k: v[0] for k, v in params.items()}

        ok = "code" in CallbackHandler.result
        msg = "Authorized. You can close this tab." if ok else "Authorization failed."
        page = f"<html><body style='font:16px system-ui;padding:3rem'>{msg}</body></html>"
        self.send_response(200 if ok else 400)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(page.encode())

    def log_message(self, *_):
        pass  # keep the console clean


def login():
    cid = client_id()
    verifier, challenge = make_verifier_and_challenge()
    state = secrets.token_urlsafe(16)

    params = {
        "client_id": cid,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "scope": " ".join(SCOPES),
        "code_challenge_method": "S256",
        "code_challenge": challenge,
    }
    url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"

    try:
        server = http.server.HTTPServer((REDIRECT_HOST, REDIRECT_PORT), CallbackHandler)
    except OSError as exc:
        sys.exit(f"Cannot bind {REDIRECT_URI} ({exc}). Is another process on {REDIRECT_PORT}?")

    listener = threading.Thread(target=server.handle_request, daemon=True)
    listener.start()

    print(f"Opening browser for Spotify authorization…\nIf it does not open:\n{url}\n")
    webbrowser.open(url)

    listener.join(timeout=180)
    server.server_close()

    result = CallbackHandler.result
    if not result:
        sys.exit("Timed out waiting for the Spotify redirect.")
    if result.get("state") != state:
        sys.exit("State mismatch — possible CSRF. Aborting.")
    if "error" in result:
        sys.exit(f"Spotify returned an error: {result['error']}")

    tokens = post_form(
        TOKEN_URL,
        {
            "grant_type": "authorization_code",
            "code": result["code"],
            "redirect_uri": REDIRECT_URI,
            "client_id": cid,
            "code_verifier": verifier,
        },
    )
    save_tokens(tokens)
    me = api_get("me")
    print(f"Logged in as {me.get('display_name')} ({me.get('id')})")
    print(f"Tokens stored in {TOKEN_FILE.name} (chmod 600)")


def valid_access_token():
    """Return a live access token, refreshing transparently when stale."""
    import time

    tokens = read_tokens()
    if tokens.get("expires_at", 0) > time.time():
        return tokens["access_token"]

    refresh = tokens.get("refresh_token")
    if not refresh:
        sys.exit("Access token expired and no refresh token. Run login again.")
    refreshed = post_form(
        TOKEN_URL,
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": client_id(),
        },
    )
    return save_tokens(refreshed)["access_token"]


# --- commands ---------------------------------------------------------------


def cmd_me():
    me = api_get("me")
    for key in ("display_name", "id", "email", "country", "product"):
        print(f"{key:>14}: {me.get(key)}")
    print(f"{'followers':>14}: {me.get('followers', {}).get('total')}")


def cmd_top(kind="tracks"):
    if kind not in ("tracks", "artists"):
        sys.exit("Usage: top [tracks|artists]")
    data = api_get(f"me/top/{kind}?limit=10&time_range=medium_term")
    items = data.get("items", [])
    if not items:
        print("No listening history in this window.")
    for i, item in enumerate(items, 1):
        if kind == "tracks":
            artists = ", ".join(a["name"] for a in item["artists"])
            print(f"{i:>2}. {item['name']} — {artists}")
        else:
            print(f"{i:>2}. {item['name']}")


def cmd_recent():
    data = api_get("me/player/recently-played?limit=10")
    for i, entry in enumerate(data.get("items", []), 1):
        track = entry["track"]
        artists = ", ".join(a["name"] for a in track["artists"])
        print(f"{i:>2}. {track['name']} — {artists}  ({entry['played_at'][:19]}Z)")


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "login"

    if cmd == "login":
        login()
    elif cmd == "me":
        cmd_me()
    elif cmd == "top":
        cmd_top(args[1] if len(args) > 1 else "tracks")
    elif cmd == "recent":
        cmd_recent()
    elif cmd == "get":
        if len(args) < 2:
            sys.exit('Usage: get "me/playlists?limit=5"')
        print(json.dumps(api_get(args[1]), indent=2))
    elif cmd == "token":
        print(valid_access_token())
    elif cmd == "logout":
        TOKEN_FILE.unlink(missing_ok=True)
        print("Tokens removed.")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
