"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Radio,
  CircleAlert,
  Users,
  CalendarClock,
  Globe,
  Settings,
  LogOut,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Brand } from "./brand";
import { AccountSettings } from "./account-settings";
type Monitor = {
  id: string;
  name: string;
  url: string;
  state: string;
  enabled: boolean;
  is_public: boolean;
  response_ms: number | null;
  checked_at: string | null;
  uptime: string | null;
  samples: number;
  interval_seconds: number;
};
type Point = { state: string; response_ms: number; checked_at: string };
type Incident = {
  id: string;
  title: string;
  state: string;
  severity: string;
  is_public: boolean;
  assignee_name: string | null;
  updates: { body: string; state: string; created_at: string }[];
};
type Member = {
  id: string;
  role: string;
  user_id: string;
  name: string;
  email: string;
};
type Data = {
  role: string;
  monitors: Monitor[];
  history: { monitor_id: string; points: Point[] }[];
  incidents: Incident[];
  members: Member[];
  maintenance: {
    id: string;
    title: string;
    monitor_name: string;
    starts_at: string;
    ends_at: string;
  }[];
  page: { slug: string; title: string; published: boolean } | null;
};
const tabs = [
  ["Overview", LayoutDashboard],
  ["Monitors", Radio],
  ["Incidents", CircleAlert],
  ["Team", Users],
  ["Maintenance", CalendarClock],
  ["Status page", Globe],
  ["Settings", Settings],
] as const;
function Badge({ state }: { state: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${["up", "resolved"].includes(state) ? "bg-emerald-50 text-emerald-700" : ["down", "critical"].includes(state) ? "bg-red-50 text-red-700" : "bg-purple-50 text-purple-700"}`}
    >
      {state}
    </span>
  );
}
function Chart({ points }: { points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.response_ms));
  const coords = points
    .map(
      (p, i) =>
        `${points.length === 1 ? 150 : 5 + (i * 290) / Math.max(1, points.length - 1)},${65 - (p.response_ms / max) * 55}`,
    )
    .join(" ");
  return (
    <div className="mt-4">
      <svg
        viewBox="0 0 300 75"
        role="img"
        aria-label="Response time for the latest checks"
        className="h-20 w-full"
      >
        <path
          d="M0 65H300 M0 35H300 M0 5H300"
          stroke="#eeeaf9"
          strokeWidth="1"
        />
        <polyline
          fill="none"
          stroke="#8672e8"
          strokeWidth="2"
          points={coords}
        />
        {points.length === 1 && (
          <circle
            cx="150"
            cy={65 - (points[0].response_ms / max) * 55}
            r="3"
            fill="#8672e8"
          />
        )}
      </svg>
      <p className="muted text-[10px]">
        {points.length
          ? `${points.length} checks · Peak ${max} ms`
          : "No checks yet · Waiting for the worker"}
      </p>
    </div>
  );
}
function ActionForm({
  children,
  onSubmit,
  label = "Save",
  busy,
}: {
  children: ReactNode;
  onSubmit: (fields: FormData) => Promise<void>;
  label?: string;
  busy: boolean;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      {children}
      <button className="btn" disabled={busy}>
        {busy ? "Working…" : label}
      </button>
    </form>
  );
}
export function Dashboard({
  initial,
  teams,
  teamId,
  user,
}: {
  initial: Data;
  teams: { id: string; name: string }[];
  teamId: string;
  user: { name: string; email: string };
}) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("Overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const manager = ["owner", "admin"].includes(data.role);
  async function reload() {
    const response = await fetch(`/api/teams/${teamId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }
  async function perform(work: () => Promise<void>, message = "Saved.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await reload();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }
  async function action(body: Record<string, unknown>, message?: string) {
    await perform(async () => {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
    }, message);
  }
  const open = data.incidents.filter((i) => i.state !== "resolved");
  const up = data.monitors.filter((m) => m.enabled && m.state === "up").length;
  function monitorOptions() {
    return (
      <>
        <option value="">Choose a monitor</option>
        {data.monitors.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </>
    );
  }
  function monitorCard(m: Monitor) {
    const points =
      data.history.find((h) => h.monitor_id === m.id)?.points || [];
    return (
      <article key={m.id} className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{m.name}</h3>
            <p className="muted mt-2 max-w-64 truncate text-[10px]">{m.url}</p>
          </div>
          <Badge state={m.enabled ? m.state : "paused"} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div>
            <p className="eyebrow">Uptime</p>
            <p className="mt-2 text-lg font-semibold">
              {m.uptime === null ? "—" : `${m.uptime}%`}
            </p>
          </div>
          <div>
            <p className="eyebrow">Response</p>
            <p className="mt-2 text-lg font-semibold">
              {m.response_ms === null ? "—" : `${m.response_ms} ms`}
            </p>
          </div>
          <div>
            <p className="eyebrow">Interval</p>
            <p className="mt-2 text-lg font-semibold">
              {m.interval_seconds / 60} min
            </p>
          </div>
        </div>
        <Chart points={points} />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {m.enabled && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                action(
                  { action: "check-monitor", id: m.id },
                  "Check queued. The worker will pick it up on its next run.",
                )
              }
            >
              Queue check
            </button>
          )}
          {manager && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                action({
                  action: "toggle-monitor",
                  id: m.id,
                  enabled: !m.enabled,
                })
              }
            >
              {m.enabled ? "Pause" : "Resume"}
            </button>
          )}
        </div>
        <p className="muted mt-3 text-[10px]">
          {m.checked_at
            ? `Last check ${new Date(m.checked_at).toISOString().slice(0, 16).replace("T", " ") + " UTC"}`
            : "Not checked yet"}{" "}
          · {m.is_public ? "Public" : "Private"}
        </p>
      </article>
    );
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="border-b border-[#e4e5ef] bg-white p-6 lg:sticky lg:top-0 lg:h-screen lg:border-r">
        <Brand />
        <p className="eyebrow mt-10 hidden lg:block">Workspace</p>
        <select
          aria-label="Choose team"
          value={teamId}
          onChange={(e) =>
            router.push(`/dashboard?team=${encodeURIComponent(e.target.value)}`)
          }
          className="mt-3 text-xs"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <nav className="mt-6 flex gap-1 overflow-x-auto lg:flex-col">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              onClick={() => {
                setTab(name);
                setError("");
                setNotice("");
              }}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-xs ${tab === name ? "bg-[#eeeaff] font-semibold text-[#6855d9]" : "text-[#8c8ca2] hover:bg-gray-50"}`}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </nav>
        <div className="mt-8 hidden border-t border-gray-100 pt-5 lg:block">
          <p className="text-xs font-semibold">{user.name}</p>
          <p className="muted mt-1 truncate text-[10px]">{user.email}</p>
          <button
            className="muted mt-5 flex items-center gap-2 text-xs"
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-7 md:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#e4e5ef] pb-5">
          <span className="muted text-xs">
            Workspace / <span className="text-[#45455b]">{tab}</span>
          </span>
          <div className="flex items-center gap-3">
            <Badge state={data.role} />
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => perform(reload, "View refreshed.")}
            >
              Refresh
            </button>
            <button
              aria-label="Sign out"
              className="lg:hidden"
              onClick={async () => {
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700"
          >
            {notice}
          </p>
        )}
        {tab !== "Settings" && (
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                {tab === "Overview"
                  ? "Your services, at a glance"
                  : "A clear place to work"}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {tab === "Overview" ? `The pulse of your team.` : tab}
              </h1>
              <p className="muted mt-3 text-xs">
                {tab === "Overview"
                  ? "Stay close to what’s running. Be ready for what comes next."
                  : "Changes are saved to your team’s workspace."}
              </p>
            </div>
            {tab === "Overview" && manager && (
              <button className="btn" onClick={() => setTab("Monitors")}>
                <Plus size={14} />
                Add monitor
              </button>
            )}
          </div>
        )}
        {tab === "Overview" && (
          <>
            <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Active monitors",
                  data.monitors.filter((m) => m.enabled).length,
                  Radio,
                ],
                ["Operational", up, Activity],
                ["Open incidents", open.length, CircleAlert],
                ["Team members", data.members.length, Users],
              ].map(([name, count, Icon]) => {
                const Component = Icon as typeof Activity;
                return (
                  <div className="card" key={String(name)}>
                    <div className="flex justify-between">
                      <p className="eyebrow">{String(name)}</p>
                      <Component size={16} className="text-[#9b8ee0]" />
                    </div>
                    <p className="mt-5 text-3xl font-semibold">
                      {String(count)}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mb-4 flex justify-between">
              <h2 className="text-sm font-semibold">Service health</h2>
              <span className="muted text-[10px]">
                Uptime over recorded checks · Last 30 days
              </span>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              {data.monitors.slice(0, 4).map(monitorCard)}
            </div>
            {!data.monitors.length && (
              <div className="card text-center">
                <Radio className="mx-auto text-[#6855d9]" />
                <h2 className="mt-4 font-semibold">
                  Start with your first service.
                </h2>
                <p className="muted mt-3 text-sm">
                  Add a website to begin collecting real check history.
                </p>
                <button className="btn mt-5" onClick={() => setTab("Monitors")}>
                  View monitors
                </button>
              </div>
            )}
            <div className="card mt-7">
              <h2 className="text-sm font-semibold">Needs attention</h2>
              {open.length ? (
                open.slice(0, 5).map((i) => (
                  <button
                    key={i.id}
                    onClick={() => setTab("Incidents")}
                    className="mt-5 flex w-full justify-between text-left text-sm"
                  >
                    <span>{i.title}</span>
                    <Badge state={i.state} />
                  </button>
                ))
              ) : (
                <p className="muted mt-5 text-sm">
                  No open incidents. A little breathing room.
                </p>
              )}
            </div>
          </>
        )}
        {tab === "Monitors" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
            <div className="space-y-5">
              {data.monitors.map(monitorCard)}
              {!data.monitors.length && (
                <div className="card muted text-sm">No monitors yet.</div>
              )}
            </div>
            {manager && (
              <section className="card h-fit">
                <h2 className="mb-5 font-semibold">Add a monitor</h2>
                <ActionForm
                  busy={busy}
                  label="Create monitor"
                  onSubmit={(f) =>
                    action(
                      {
                        action: "add-monitor",
                        name: f.get("name"),
                        url: f.get("url"),
                        interval: Number(f.get("interval")),
                        public: f.get("public") === "on",
                      },
                      "Monitor created. Start the worker to collect checks.",
                    )
                  }
                >
                  <label>
                    Service name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={200}
                      placeholder="Production website"
                    />
                  </label>
                  <label>
                    Website URL
                    <input
                      name="url"
                      type="url"
                      required
                      placeholder="https://example.com"
                    />
                  </label>
                  <label>
                    Check interval
                    <select name="interval" defaultValue="300">
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                      <option value="900">15 minutes</option>
                      <option value="3600">1 hour</option>
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" name="public" />
                    Show on public status page
                  </label>
                  <p className="muted text-xs leading-6">
                    Intervals take effect while the scheduler is running. Checks
                    time out after 10 seconds.
                  </p>
                </ActionForm>
              </section>
            )}
          </div>
        )}
        {tab === "Incidents" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
            <div className="space-y-5">
              {!data.incidents.length && (
                <div className="card muted text-sm">No incidents yet.</div>
              )}
              {data.incidents.map((i) => (
                <article className="card" key={i.id}>
                  <div className="flex justify-between gap-3">
                    <h2 className="font-semibold">{i.title}</h2>
                    <Badge state={i.state} />
                  </div>
                  <p className="muted mt-3 text-xs">
                    {i.severity} · {i.assignee_name || "Unassigned"} ·{" "}
                    {i.is_public ? "Public" : "Private"}
                  </p>
                  {i.updates.map((u) => (
                    <div
                      key={u.created_at}
                      className="my-5 border-l-2 border-purple-200 pl-4"
                    >
                      <p className="eyebrow">
                        {u.state} ·{" "}
                        {new Date(u.created_at)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ") + " UTC"}
                      </p>
                      <p className="mt-2 text-sm leading-6">{u.body}</p>
                    </div>
                  ))}
                  {i.state !== "resolved" && (
                    <ActionForm
                      busy={busy}
                      label="Publish update"
                      onSubmit={(f) =>
                        action({
                          action: "update-incident",
                          id: i.id,
                          state: f.get("state"),
                          body: f.get("body"),
                        })
                      }
                    >
                      <label>
                        Next state
                        <select name="state" defaultValue={i.state}>
                          {[
                            "investigating",
                            "identified",
                            "monitoring",
                            "resolved",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Update
                        <textarea
                          name="body"
                          required
                          minLength={3}
                          maxLength={3000}
                          rows={3}
                        />
                      </label>
                    </ActionForm>
                  )}
                </article>
              ))}
            </div>
            <section className="card h-fit">
              <h2 className="mb-5 font-semibold">Open an incident</h2>
              <ActionForm
                busy={busy}
                label="Create incident"
                onSubmit={(f) =>
                  action({
                    action: "incident",
                    title: f.get("title"),
                    severity: f.get("severity"),
                    monitor: f.get("monitor") || undefined,
                    assignee: f.get("assignee") || undefined,
                    public: f.get("public") === "on",
                    body: f.get("body"),
                  })
                }
              >
                <label>
                  Title
                  <input name="title" required minLength={2} maxLength={200} />
                </label>
                <label>
                  Affected monitor
                  <select name="monitor">{monitorOptions()}</select>
                </label>
                <label>
                  Severity
                  <select name="severity">
                    <option>minor</option>
                    <option>major</option>
                    <option>critical</option>
                  </select>
                </label>
                <label>
                  Assign to
                  <select name="assignee">
                    <option value="">Unassigned</option>
                    {data.members.map((m) => (
                      <option key={m.id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Initial update
                  <textarea
                    name="body"
                    required
                    minLength={3}
                    maxLength={3000}
                  />
                </label>
                <label>
                  <input name="public" type="checkbox" />
                  Publish on status page
                </label>
              </ActionForm>
            </section>
          </div>
        )}
        {tab === "Team" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="card">
              <h2 className="font-semibold">Your people</h2>
              {data.members.map((m) => (
                <div
                  key={m.id}
                  className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5"
                >
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="muted mt-1 text-xs">{m.email}</p>
                  </div>
                  <Badge state={m.role} />
                  {data.role === "owner" && m.role !== "owner" && (
                    <div className="flex gap-2">
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            const result =
                              await authClient.organization.updateMemberRole({
                                organizationId: teamId,
                                memberId: m.id,
                                role: m.role === "admin" ? "member" : "admin",
                              });
                            if (result.error)
                              throw new Error(result.error.message);
                          })
                        }
                      >
                        {m.role === "admin" ? "Make member" : "Make admin"}
                      </button>
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            const result =
                              await authClient.organization.removeMember({
                                organizationId: teamId,
                                memberIdOrEmail: m.id,
                              });
                            if (result.error)
                              throw new Error(result.error.message);
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
            {manager && (
              <section className="card h-fit">
                <h2 className="mb-5 font-semibold">Invite a teammate</h2>
                <ActionForm
                  busy={busy}
                  label="Send invitation"
                  onSubmit={(f) =>
                    perform(async () => {
                      const result = await authClient.organization.inviteMember(
                        {
                          organizationId: teamId,
                          email: String(f.get("email")),
                          role: f.get("role") === "admin" ? "admin" : "member",
                        },
                      );
                      if (result.error) throw new Error(result.error.message);
                    }, "Invitation sent. It expires in 48 hours.")
                  }
                >
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="member">Member</option>
                      {data.role === "owner" && (
                        <option value="admin">Admin</option>
                      )}
                    </select>
                  </label>
                </ActionForm>
              </section>
            )}
          </div>
        )}
        {tab === "Maintenance" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="card">
              <h2 className="font-semibold">Upcoming windows</h2>
              {!data.maintenance.length && (
                <p className="muted mt-5 text-sm">No upcoming maintenance.</p>
              )}
              {data.maintenance.map((w) => (
                <div key={w.id} className="mt-5 border-t border-gray-100 pt-5">
                  <h3 className="text-sm font-semibold">{w.title}</h3>
                  <p className="muted mt-2 text-xs">
                    {w.monitor_name}
                    <br />
                    {new Date(w.starts_at)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ") + " UTC"}{" "}
                    –{" "}
                    {new Date(w.ends_at)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ") + " UTC"}
                  </p>
                </div>
              ))}
            </section>
            {manager && (
              <section className="card h-fit">
                <h2 className="mb-5 font-semibold">Schedule maintenance</h2>
                <ActionForm
                  busy={busy}
                  onSubmit={(f) => {
                    try {
                      return action({
                        action: "maintenance",
                        monitor: f.get("monitor"),
                        title: f.get("title"),
                        starts: new Date(String(f.get("starts"))).toISOString(),
                        ends: new Date(String(f.get("ends"))).toISOString(),
                      });
                    } catch {
                      setError("Choose valid dates.");
                      return Promise.resolve();
                    }
                  }}
                >
                  <label>
                    Monitor
                    <select name="monitor" required>
                      {monitorOptions()}
                    </select>
                  </label>
                  <label>
                    Title
                    <input
                      name="title"
                      required
                      minLength={2}
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Starts (your local time)
                    <input name="starts" type="datetime-local" required />
                  </label>
                  <label>
                    Ends (your local time)
                    <input name="ends" type="datetime-local" required />
                  </label>
                  <p className="muted text-xs leading-6">
                    Checks continue, but downtime alerts are suppressed during
                    this window.
                  </p>
                </ActionForm>
              </section>
            )}
          </div>
        )}
        {tab === "Status page" && (
          <section className="card max-w-xl">
            <h2 className="mb-5 font-semibold">Keep users in the loop.</h2>
            {data.page?.published && (
              <Link
                target="_blank"
                href={`/status/${data.page.slug}`}
                className="btn secondary mb-6"
              >
                View public page <ArrowUpRight size={14} />
              </Link>
            )}
            {manager ? (
              <ActionForm
                busy={busy}
                label="Save status page"
                onSubmit={(f) =>
                  action({
                    action: "status-page",
                    title: f.get("title"),
                    slug: f.get("slug"),
                    published: f.get("published") === "on",
                  })
                }
              >
                <label>
                  Page title
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={200}
                    defaultValue={
                      data.page?.title ||
                      teams.find((t) => t.id === teamId)?.name
                    }
                  />
                </label>
                <label>
                  Public address
                  <input
                    name="slug"
                    required
                    minLength={3}
                    maxLength={60}
                    pattern="[a-z0-9][a-z0-9-]+"
                    defaultValue={data.page?.slug || ""}
                    placeholder="your-team"
                  />
                </label>
                <label>
                  <input
                    name="published"
                    type="checkbox"
                    defaultChecked={data.page?.published}
                  />
                  Publish this page
                </label>
                <p className="muted text-xs leading-6">
                  Only monitors and incidents marked public appear. Private
                  URLs, team members, and email addresses stay private.
                </p>
              </ActionForm>
            ) : (
              <p className="muted text-sm">
                An owner or admin can configure the public page.
              </p>
            )}
          </section>
        )}
        {tab === "Settings" && (
          <div className="max-w-2xl">
            <AccountSettings name={user.name} email={user.email} />
          </div>
        )}
      </main>
    </div>
  );
}
