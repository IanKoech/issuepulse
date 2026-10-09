"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Brand } from "./brand";
export function Invite({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId: id,
      });
      if (result.error) throw new Error(result.error.message);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to accept.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Brand />
      <section className="card mt-10">
        <h1 className="text-2xl font-semibold">Your team is waiting.</h1>
        <p className="muted my-5 text-sm leading-7">
          Sign in with the verified email address that received this invitation,
          then accept below. Invitations expire after 48 hours.
        </p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn" onClick={accept}>
          {busy ? "Accepting…" : "Accept invitation"}
        </button>
        <div className="mt-6 flex gap-5 text-sm">
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
        </div>
      </section>
    </main>
  );
}
