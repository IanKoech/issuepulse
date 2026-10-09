"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
export function OnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    const slug = `${
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "team"
    }-${crypto.randomUUID().slice(0, 8)}`;
    try {
      const result = await authClient.organization.create({ name, slug });
      if (result.error || !result.data)
        throw new Error(result.error?.message || "Could not create your team.");
      const active = await authClient.organization.setActive({
        organizationId: result.data.id,
      });
      if (active.error) throw new Error(active.error.message);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="block text-sm">
        Team name
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          placeholder="e.g. Ian’s Studio"
          className="mt-2 w-full rounded-lg border border-[#ddddeb] bg-white p-4"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-lg bg-[#6855d9] p-4 text-sm text-white"
      >
        {busy ? "Creating team…" : "Create your team ↗"}
      </button>
    </form>
  );
}
