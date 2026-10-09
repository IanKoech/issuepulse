import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding-form";
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect("/login");
  const { rows } = await db.query(
    'SELECT id FROM member WHERE "userId"=$1 LIMIT 1',
    [session.user.id],
  );
  if (rows.length) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-lg px-6 py-14">
      <Brand />
      <section className="card mt-12">
        <p className="eyebrow">A home for your services</p>
        <h1 className="mt-4 text-3xl font-semibold">Create your team.</h1>
        <p className="muted mt-4 text-sm">
          Add monitors, invite your people, and get a clear view of reliability.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
