import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { snapshot } from "@/lib/monitoring";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !session.user.emailVerified) redirect("/login");
  const { rows: teams } = await db.query(
    'SELECT o.id,o.name,m.role FROM organization o JOIN member m ON m."organizationId"=o.id WHERE m."userId"=$1 ORDER BY o."createdAt"',
    [session.user.id],
  );
  if (!teams.length) redirect("/onboarding");
  const selected = (await searchParams).team;
  const team = teams.find((t) => t.id === selected) || teams[0];
  const data = JSON.parse(
    JSON.stringify({ ...(await snapshot(team.id)), role: team.role }),
  );
  return (
    <Dashboard
      key={team.id}
      initial={data}
      teams={teams}
      teamId={team.id}
      user={{ name: session.user.name, email: session.user.email }}
    />
  );
}
