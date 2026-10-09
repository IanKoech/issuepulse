import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Brand } from "@/components/brand";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { rows: pages } = await db.query(
    "SELECT * FROM status_page WHERE slug=$1 AND published=TRUE",
    [(await params).slug],
  );
  if (!pages.length) notFound();
  const page = pages[0];
  const { rows: monitors } = await db.query(
    `SELECT m.name,m.state,c.checked_at FROM monitor m LEFT JOIN LATERAL(SELECT checked_at FROM monitor_check WHERE monitor_id=m.id ORDER BY checked_at DESC LIMIT 1)c ON TRUE WHERE m.team_id=$1 AND m.is_public=TRUE AND m.enabled=TRUE ORDER BY m.name`,
    [page.team_id],
  );
  const { rows: incidents } = await db.query(
    `SELECT i.id,i.title,i.state,i.created_at,COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM(SELECT body,state,created_at FROM incident_update WHERE incident_id=i.id ORDER BY created_at DESC LIMIT 20)x),'[]') updates FROM incident i WHERE i.team_id=$1 AND i.is_public=TRUE ORDER BY i.created_at DESC LIMIT 30`,
    [page.team_id],
  );
  const { rows: windows } = await db.query(
    "SELECT w.title,w.starts_at,w.ends_at,m.name FROM maintenance w JOIN monitor m ON m.id=w.monitor_id WHERE w.team_id=$1 AND m.is_public=TRUE AND w.ends_at>NOW() ORDER BY w.starts_at",
    [page.team_id],
  );
  const down = monitors.some((m) => m.state === "down"),
    pending = monitors.some((m) => m.state === "pending");
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Brand />
      <p className="eyebrow mt-12">Service status</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {page.title}
      </h1>
      <div
        className={`card my-8 ${down ? "text-red-700" : pending || !monitors.length ? "text-amber-700" : "text-emerald-700"}`}
      >
        {down
          ? "Some services are experiencing issues"
          : pending
            ? "Waiting for initial checks"
            : !monitors.length
              ? "No public services yet"
              : "All monitored services are operational"}
      </div>
      <div className="card">
        {monitors.map((m) => (
          <div
            key={m.name}
            className="flex justify-between border-b border-gray-100 py-4 text-sm"
          >
            <span>{m.name}</span>
            <span>
              {m.state} ·{" "}
              {m.checked_at
                ? new Date(m.checked_at)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ") + " UTC"
                : "Not checked"}
            </span>
          </div>
        ))}
      </div>
      {windows.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-semibold">Scheduled maintenance</h2>
          {windows.map((w) => (
            <p key={w.title} className="muted mt-4 text-sm">
              {w.title} · {w.name}
              <br />
              {new Date(w.starts_at).toISOString()} –{" "}
              {new Date(w.ends_at).toISOString()}
            </p>
          ))}
        </section>
      )}
      <h2 className="mt-10 text-xl font-semibold">Incident history</h2>
      {incidents.length === 0 && (
        <p className="muted mt-4 text-sm">No published incidents.</p>
      )}
      {incidents.map((i) => (
        <article key={i.id} className="card mt-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold">{i.title}</h3>
            <span className="muted text-xs">{i.state}</span>
          </div>
          {i.updates.map(
            (u: { body: string; state: string; created_at: string }) => (
              <div
                key={u.created_at}
                className="mt-5 border-l-2 border-purple-200 pl-4"
              >
                <p className="eyebrow">
                  {u.state} ·{" "}
                  {new Date(u.created_at).toISOString().slice(0, 16)} UTC
                </p>
                <p className="mt-2 text-sm leading-6">{u.body}</p>
              </div>
            ),
          )}
        </article>
      ))}
      <p className="muted mt-10 text-xs">
        Latest recorded checks shown above. Status is not a guarantee of
        continuous availability.
      </p>
    </main>
  );
}
