"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { firebaseConfigured, googleIdToken } from "@/lib/firebaseClient";
import { unwrap } from "@/lib/proxyClient";

export default function LoginView() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleIdToken();
      await unwrap(
        await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }),
      );
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!firebaseConfigured) {
    return <p className="entry-meta">Sign-in isn&apos;t configured: set the NEXT_PUBLIC_FIREBASE_* variables.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => void signIn()} disabled={busy} className="entry-title self-start hover:text-accent disabled:opacity-40">
        {busy ? "Signing in…" : "Sign in with Google →"}
      </button>
      {error ? <p className="entry-meta text-accent">{error}</p> : null}
    </div>
  );
}
