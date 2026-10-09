"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Brand } from "./brand";
export function AuthForm({
  mode,
  token,
  googleEnabled = false,
}: {
  mode: "login" | "register" | "forgot" | "reset";
  token?: string;
  googleEnabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const email = String(form.get("email") || ""),
        password = String(form.get("password") || "");
      const result =
        mode === "register"
          ? await authClient.signUp.email({
              name: String(form.get("name")),
              email,
              password,
              callbackURL: "/onboarding",
            })
          : mode === "login"
            ? await authClient.signIn.email({ email, password })
            : mode === "forgot"
              ? await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${location.origin}/reset-password`,
                })
              : await authClient.resetPassword({
                  token: token || "",
                  newPassword: password,
                });
      if (result.error)
        throw new Error(
          result.error.message || "Unable to complete your request.",
        );
      if (mode === "login") {
        router.push("/dashboard");
        router.refresh();
      } else
        setMessage(
          mode === "register"
            ? "Check your email to verify your account and continue."
            : mode === "forgot"
              ? "If that account exists, a reset link has been sent."
              : "Password updated. You can now sign in.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    const form = document.querySelector<HTMLFormElement>("#auth-form");
    const email = String(new FormData(form!).get("email") || "");
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/onboarding",
      });
      if (result.error) throw new Error(result.error.message);
      setMessage("If verification is needed, a new link has been sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send email.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex h-24 items-center">
        <Brand />
      </header>
      <div className="grid min-h-[70vh] items-center gap-12 py-10 lg:grid-cols-2">
        <section className="rounded-3xl bg-[#eae6ff] p-10">
          <p className="eyebrow">A little clarity goes a long way</p>
          <h1 className="mt-8 text-5xl leading-tight font-semibold tracking-tighter">
            Less guessing.
            <br />
            More confidence.
          </h1>
          <p className="mt-7 text-sm leading-7 text-[#77708e]">
            Keep an eye on what matters. Bring your team together when it
            counts.
          </p>
        </section>
        <section className="max-w-md">
          <p className="eyebrow">Welcome to IssuePulse</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            {
              {
                login: "Good to see you.",
                register: "Start with a clear view.",
                forgot: "Find your way back.",
                reset: "Set a new password.",
              }[mode]
            }
          </h2>
          <form id="auth-form" onSubmit={submit} className="mt-7 space-y-5">
            {mode === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                {mode !== "login" && (
                  <span className="muted mt-2 block text-[10px]">
                    At least 12 characters.
                  </span>
                )}
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-emerald-700">
                {message}
              </p>
            )}
            <button disabled={busy} className="btn w-full">
              {busy
                ? "Working…"
                : {
                    login: "Sign in",
                    register: "Create account",
                    forgot: "Send reset link",
                    reset: "Update password",
                  }[mode]}
            </button>
          </form>
          {googleEnabled && ["login", "register"].includes(mode) && (
            <button
              className="btn secondary mt-3 w-full"
              onClick={() =>
                authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/onboarding",
                })
              }
            >
              Continue with Google
            </button>
          )}
          <div className="muted mt-5 flex flex-wrap gap-5 text-xs">
            <Link href={mode === "login" ? "/register" : "/login"}>
              {mode === "login" ? "Create an account" : "Back to sign in"}
            </Link>
            {mode === "login" && (
              <Link href="/forgot-password">Forgot password?</Link>
            )}
            {["login", "register"].includes(mode) && (
              <button disabled={busy} onClick={resend}>
                Resend verification email
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
