import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { ApiError, requestAccess } from "./access";
import { monitorUrl } from "./probe";
export async function snapshot(team: string) {
  const monitors = await db.query(
    `SELECT m.*,latest.response_ms,latest.checked_at,stats.uptime,stats.samples FROM monitor m LEFT JOIN LATERAL (SELECT response_ms,checked_at FROM monitor_check WHERE monitor_id=m.id ORDER BY checked_at DESC LIMIT 1) latest ON TRUE LEFT JOIN LATERAL (SELECT ROUND(100.0*COUNT(*) FILTER(WHERE state='up')/NULLIF(COUNT(*),0),2) uptime,COUNT(*)::INTEGER samples FROM monitor_check WHERE monitor_id=m.id AND checked_at>NOW()-INTERVAL '30 days') stats ON TRUE WHERE m.team_id=$1 ORDER BY m.created_at DESC`,
    [team],
  );
  const incidents = await db.query(
    `SELECT i.*,u.name assignee_name,COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM (SELECT body,state,created_at FROM incident_update WHERE incident_id=i.id ORDER BY created_at DESC LIMIT 20) x),'[]') updates FROM incident i LEFT JOIN "user" u ON u.id=i.assignee_id WHERE i.team_id=$1 ORDER BY i.created_at DESC LIMIT 100`,
    [team],
  );
  const members = await db.query(
    'SELECT m.id,m.role,u.id user_id,u.name,u.email FROM member m JOIN "user" u ON u.id=m."userId" WHERE m."organizationId"=$1',
    [team],
  );
  const maintenance = await db.query(
    "SELECT w.*,m.name monitor_name FROM maintenance w JOIN monitor m ON m.id=w.monitor_id WHERE w.team_id=$1 AND w.ends_at>NOW() ORDER BY w.starts_at",
    [team],
  );
  const page = await db.query("SELECT * FROM status_page WHERE team_id=$1", [
    team,
  ]);
  const history = await db.query(
    `SELECT m.id monitor_id,COALESCE((SELECT json_agg(c ORDER BY c.checked_at) FROM (SELECT state,response_ms,checked_at FROM monitor_check WHERE monitor_id=m.id ORDER BY checked_at DESC LIMIT 60) c),'[]') points FROM monitor m WHERE m.team_id=$1`,
    [team],
  );
  return {
    monitors: monitors.rows,
    incidents: incidents.rows,
    members: members.rows,
    maintenance: maintenance.rows,
    page: page.rows[0] || null,
    history: history.rows,
  };
}
const id = z.string().min(1).max(100);
const text = z.string().trim().min(2).max(200);
const actions = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-monitor"),
    name: text,
    url: z.string().url().max(2048),
    interval: z.coerce.number().int().min(60).max(86400),
    public: z.boolean(),
  }),
  z.object({ action: z.literal("toggle-monitor"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("check-monitor"), id }),
  z.object({
    action: z.literal("incident"),
    title: text,
    severity: z.enum(["minor", "major", "critical"]),
    monitor: id.optional(),
    assignee: id.optional(),
    public: z.boolean(),
    body: z.string().trim().min(3).max(3000),
  }),
  z.object({
    action: z.literal("update-incident"),
    id,
    state: z.enum(["investigating", "identified", "monitoring", "resolved"]),
    body: z.string().trim().min(3).max(3000),
  }),
  z.object({
    action: z.literal("maintenance"),
    monitor: id,
    title: text,
    starts: z.iso.datetime(),
    ends: z.iso.datetime(),
  }),
  z.object({
    action: z.literal("status-page"),
    title: text,
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/),
    published: z.boolean(),
  }),
]);
export async function handleTeam(request: Request, team: string) {
  try {
    if (request.method === "GET") {
      const access = await requestAccess(request, team);
      return Response.json(
        { ...(await snapshot(team)), role: access.role },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (!request.body) throw new ApiError(400, "Missing body.");
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      length += chunk.length;
      if (length > 16384) throw new ApiError(413, "Request too large.");
      chunks.push(chunk);
    }
    const data = actions.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const manager = [
      "add-monitor",
      "toggle-monitor",
      "maintenance",
      "status-page",
    ].includes(data.action);
    const { user } = await requestAccess(request, team, manager);
    const connection = await db.connect();
    try {
      await connection.query("BEGIN");
      if ("monitor" in data && data.monitor) {
        const found = await connection.query(
          "SELECT id FROM monitor WHERE id=$1 AND team_id=$2",
          [data.monitor, team],
        );
        if (!found.rowCount) throw new ApiError(404, "Monitor not found.");
      }
      if (data.action === "add-monitor") {
        let url;
        try {
          url = monitorUrl(data.url).href;
        } catch {
          throw new ApiError(
            400,
            "Enter a public HTTP(S) URL on a standard port, without credentials.",
          );
        }
        // Serialize creation per team to enforce the limit under concurrent writes.
        await connection.query(
          "SELECT id FROM organization WHERE id=$1 FOR UPDATE",
          [team],
        );
        const count = await connection.query(
          "SELECT COUNT(*)::INTEGER n FROM monitor WHERE team_id=$1",
          [team],
        );
        if (count.rows[0].n >= 20)
          throw new ApiError(
            400,
            "This release supports 20 monitors per team.",
          );
        await connection.query(
          "INSERT INTO monitor(id,team_id,name,url,interval_seconds,is_public) VALUES($1,$2,$3,$4,$5,$6)",
          [randomUUID(), team, data.name, url, data.interval, data.public],
        );
      } else if (
        data.action === "toggle-monitor" ||
        data.action === "check-monitor"
      ) {
        const result =
          data.action === "toggle-monitor"
            ? await connection.query(
                "UPDATE monitor SET enabled=$1 WHERE id=$2 AND team_id=$3",
                [data.enabled, data.id, team],
              )
            : await connection.query(
                "UPDATE monitor SET next_check_at=NOW() WHERE id=$1 AND team_id=$2 AND enabled=TRUE",
                [data.id, team],
              );
        if (!result.rowCount)
          throw new ApiError(404, "Enabled monitor not found.");
      } else if (data.action === "incident") {
        if (data.assignee) {
          const found = await connection.query(
            'SELECT id FROM member WHERE "userId"=$1 AND "organizationId"=$2',
            [data.assignee, team],
          );
          if (!found.rowCount)
            throw new ApiError(400, "Assignee must belong to this team.");
        }
        const incidentId = randomUUID();
        await connection.query(
          "INSERT INTO incident(id,team_id,monitor_id,title,severity,assignee_id,is_public) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            incidentId,
            team,
            data.monitor || null,
            data.title,
            data.severity,
            data.assignee || null,
            data.public,
          ],
        );
        await connection.query(
          "INSERT INTO incident_update(id,incident_id,author_id,body,state) VALUES($1,$2,$3,$4,'investigating')",
          [randomUUID(), incidentId, user.id, data.body],
        );
      } else if (data.action === "update-incident") {
        const found = await connection.query(
          "SELECT state FROM incident WHERE id=$1 AND team_id=$2 FOR UPDATE",
          [data.id, team],
        );
        if (!found.rowCount) throw new ApiError(404, "Incident not found.");
        if (found.rows[0].state === "resolved")
          throw new ApiError(
            409,
            "This incident is resolved. Open a new incident if needed.",
          );
        await connection.query(
          "UPDATE incident SET state=$1,resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE NULL END WHERE id=$2",
          [data.state, data.id],
        );
        await connection.query(
          "INSERT INTO incident_update(id,incident_id,author_id,body,state) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), data.id, user.id, data.body, data.state],
        );
      } else if (data.action === "maintenance") {
        if (
          new Date(data.ends) <= new Date(data.starts) ||
          new Date(data.ends) <= new Date()
        )
          throw new ApiError(400, "Choose a future end after the start.");
        await connection.query(
          "INSERT INTO maintenance(id,team_id,monitor_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            team,
            data.monitor,
            data.title,
            data.starts,
            data.ends,
          ],
        );
      } else if (data.action === "status-page") {
        await connection.query(
          "INSERT INTO status_page(team_id,slug,title,published) VALUES($1,$2,$3,$4) ON CONFLICT(team_id) DO UPDATE SET slug=EXCLUDED.slug,title=EXCLUDED.title,published=EXCLUDED.published",
          [team, data.slug, data.title, data.published],
        );
      }
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Check the fields and try again." },
        { status: 400 },
      );
    if ((error as { code?: string }).code === "23505")
      return Response.json(
        { error: "That status-page address is already taken." },
        { status: 409 },
      );
    console.error(
      "Team operation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      { error: "Unable to complete this action." },
      { status: 500 },
    );
  }
}
