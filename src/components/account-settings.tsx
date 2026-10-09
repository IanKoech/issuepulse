"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  buttonClass,
  cardClass,
  inputClass,
  secondaryClass,
} from "./portal-ui";
export function AccountSettings({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(
    event: FormEvent<HTMLFormElement>,
    mode: "profile" | "password" | "delete",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "delete" && fields.get("confirmation") !== "DELETE")
        throw new Error("Type DELETE to confirm your request.");
      const result =
        mode === "profile"
          ? await authClient.updateUser({
              name: String(fields.get("name")).trim(),
            })
          : mode === "password"
            ? await authClient.changePassword({
                currentPassword: String(fields.get("currentPassword")),
                newPassword: String(fields.get("newPassword")),
                revokeOtherSessions: true,
              })
            : await authClient.deleteUser({
                password: String(fields.get("password")),
                callbackURL: "/",
              });
      if (result.error)
        throw new Error(result.error.message || "Please try again.");
      setMessage(
        mode === "profile"
          ? "Profile updated."
          : mode === "password"
            ? "Password changed. Other sessions have been signed out."
            : "A confirmation link has been sent to your email. Your account is retained until you open that link.",
      );
      if (mode !== "profile") form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="text-[10px] tracking-[.18em] text-[#858399]">
        YOUR ACCOUNT
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Make yourself at home.
      </h1>
      {error && (
        <p
          role="alert"
          className="my-5 rounded-lg bg-red-50 p-4 text-xs text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="my-5 rounded-lg bg-[#e7efdb] p-4 text-xs leading-6"
        >
          {message}
        </p>
      )}
      <div className="mt-8 max-w-2xl space-y-6">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-3 text-xs text-[#879575]">
            {email} / Email verified
          </p>
          <form onSubmit={(event) => submit(event, "profile")} className="mt-5">
            <label className="block text-xs">
              Full name
              <input
                className={inputClass}
                name="name"
                defaultValue={name}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <button disabled={busy} className={buttonClass + " mt-5"}>
              Save profile
            </button>
          </form>
        </section>
        <section className={cardClass}>
          <h2 className="text-lg font-semibold">Change password</h2>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => submit(event, "password")}
          >
            <label className="block text-xs">
              Current password
              <input
                className={inputClass}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
            <label className="block text-xs">
              New password
              <input
                className={inputClass}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <p className="text-[10px] leading-6 text-[#879575]">
              Use at least 12 characters. Other active sessions are signed out
              after this change.
            </p>
            <button disabled={busy} className={buttonClass}>
              Update password
            </button>
          </form>
        </section>
        <section className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Delete account</h2>
          <p className="mt-4 text-xs leading-7 text-[#7b826f]">
            This permanently deletes your account and every team where you are
            the only owner, including projects, deliverables, and invoices. In
            teams owned by someone else, your comments and approval history
            remain labeled Former user.
          </p>
          <p className="mt-3 text-xs leading-7 text-[#7b826f]">
            Confirm your password and type DELETE. We will send you an email
            link to complete deletion.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => submit(event, "delete")}
          >
            <label className="block text-xs">
              Current password
              <input
                className={inputClass}
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
            <label className="block text-xs">
              Type DELETE to confirm
              <input
                className={inputClass}
                name="confirmation"
                autoComplete="off"
                pattern="DELETE"
                required
              />
            </label>
            <button
              disabled={busy}
              className={secondaryClass + " border-red-200 text-red-700"}
            >
              Request account deletion
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
