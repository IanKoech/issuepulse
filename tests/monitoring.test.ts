import { config } from "dotenv";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
config({ path: ".env.local" });
config();
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Use an isolated _test database.");
const { auth } = await import("../src/lib/auth");
const { db } = await import("../src/lib/db");
const { handleTeam } = await import("../src/lib/monitoring");
const { runChecks } = await import("../src/lib/checks");
const { GET: cron } = await import("../src/app/api/jobs/checks/route");
const origin = process.env.BETTER_AUTH_URL!;
test("monitoring permissions, incident workflow, scheduler and maintenance", async (t) => {
  const ids: string[] = [],
    team = randomUUID(),
    other = randomUUID();
  let ownerCookie = "",
    memberCookie = "",
    outsiderCookie = "";
  async function account(role: string) {
    const email = `${randomUUID()}@example.test`;
    const signed = await auth.api.signUpEmail({
      body: {
        name: `Test ${role}`,
        email,
        password: "a-strong-test-password-123",
      },
    });
    ids.push(signed.user.id);
    await db.query('UPDATE "user" SET "emailVerified"=TRUE WHERE id=$1', [
      signed.user.id,
    ]);
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email, password: "a-strong-test-password-123" }),
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    return { id: signed.user.id, cookie, email };
  }
  async function req(
    cookie: string,
    body?: Record<string, unknown>,
    target = team,
    requestOrigin = origin,
  ) {
    return handleTeam(
      new Request(`${origin}/api/teams/${target}`, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: cookie,
          Origin: requestOrigin,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      target,
    );
  }
  try {
    const owner = await account("owner"),
      member = await account("member"),
      outsider = await account("outsider");
    ownerCookie = owner.cookie;
    memberCookie = member.cookie;
    outsiderCookie = outsider.cookie;
    for (const id of [team, other])
      await db.query(
        "INSERT INTO organization(id,name,slug,\"createdAt\") VALUES($1,'Fixture',$2,NOW())",
        [id, `fixture-${id}`],
      );
    for (const [id, role] of [
      [owner.id, "owner"],
      [member.id, "member"],
    ])
      await db.query(
        'INSERT INTO member(id,"organizationId","userId",role,"createdAt") VALUES($1,$2,$3,$4,NOW())',
        [randomUUID(), team, id, role],
      );
    let monitor = "";
    await t.test(
      "verified sessions and current roles guard reads and manager writes",
      async () => {
        assert.equal((await req("")).status, 401);
        assert.equal((await req(outsiderCookie)).status, 403);
        assert.equal((await req(ownerCookie, undefined, other)).status, 403);
        const payload = {
          action: "add-monitor",
          name: "Production",
          url: "https://example.com",
          interval: 300,
          public: false,
        };
        assert.equal((await req(memberCookie, payload)).status, 403);
        assert.equal(
          (await req(ownerCookie, payload, team, "https://evil.example"))
            .status,
          403,
        );
        assert.equal((await req(ownerCookie, payload)).status, 200);
        const data = await (await req(memberCookie)).json();
        monitor = data.monitors[0].id;
        assert.equal(data.monitors.length, 1);
        assert.equal(data.monitors[0].state, "pending");
      },
    );
    await t.test(
      "incident assignment cannot cross teams and members can resolve incidents",
      async () => {
        const payload = {
          action: "incident",
          title: "API errors",
          severity: "major",
          monitor,
          public: false,
          body: "Investigating the issue.",
        };
        assert.equal(
          (await req(memberCookie, { ...payload, assignee: outsider.id }))
            .status,
          400,
        );
        assert.equal(
          (await req(memberCookie, { ...payload, assignee: member.id })).status,
          200,
        );
        const data = await (await req(memberCookie)).json();
        const incident = data.incidents[0];
        assert.equal(incident.assignee_name, "Test member");
        assert.equal(
          (
            await req(memberCookie, {
              action: "update-incident",
              id: incident.id,
              state: "resolved",
              body: "Service has recovered.",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await req(memberCookie, {
              action: "update-incident",
              id: incident.id,
              state: "monitoring",
              body: "Try reopening.",
            })
          ).status,
          409,
        );
        const final = await (await req(ownerCookie)).json();
        assert.equal(final.incidents[0].updates.length, 2);
      },
    );
    await t.test(
      "maintenance is restricted and must end after it starts",
      async () => {
        const starts = new Date(Date.now() + 60000).toISOString(),
          ends = new Date(Date.now() + 3600000).toISOString();
        const payload = {
          action: "maintenance",
          monitor,
          title: "Deploy window",
          starts,
          ends,
        };
        assert.equal((await req(memberCookie, payload)).status, 403);
        assert.equal(
          (await req(ownerCookie, { ...payload, ends: starts })).status,
          400,
        );
        assert.equal((await req(ownerCookie, payload)).status, 200);
      },
    );
    await t.test(
      "public publishing requires a manager and leaves private monitors private",
      async () => {
        const payload = {
          action: "status-page",
          slug: `fixture-${randomUUID()}`,
          title: "Fixture status",
          published: true,
        };
        assert.equal((await req(memberCookie, payload)).status, 403);
        assert.equal((await req(ownerCookie, payload)).status, 200);
        const data = await (await req(ownerCookie)).json();
        assert.equal(data.page.published, true);
        assert.equal(data.monitors[0].is_public, false);
      },
    );
    await t.test(
      "scheduler rejects missing and incorrect secrets",
      async () => {
        assert.equal(
          (await cron(new Request(`${origin}/api/jobs/checks`))).status,
          401,
        );
        assert.equal(
          (
            await cron(
              new Request(`${origin}/api/jobs/checks`, {
                headers: { Authorization: "Bearer wrong" },
              }),
            )
          ).status,
          401,
        );
      },
    );
    await t.test(
      "blocked probe is persisted as down with an alert and future due time",
      async () => {
        await db.query(
          "UPDATE monitor SET url='http://127.0.0.1' WHERE id=$1",
          [monitor],
        );
        await runChecks();
        const result = await db.query(
          "SELECT state,next_check_at,lease_token FROM monitor WHERE id=$1",
          [monitor],
        );
        assert.equal(result.rows[0].state, "down");
        assert.equal(result.rows[0].lease_token, null);
        assert.ok(new Date(result.rows[0].next_check_at) > new Date());
        const checks = await db.query(
          "SELECT error FROM monitor_check WHERE monitor_id=$1",
          [monitor],
        );
        assert.match(checks.rows[0].error, /blocked/);
        const alerts = await db.query(
          "SELECT recipient FROM alert_outbox WHERE monitor_id=$1",
          [monitor],
        );
        assert.equal(alerts.rowCount, 1);
        await db.query(
          "UPDATE monitor SET state='up',next_check_at=NOW() WHERE id=$1",
          [monitor],
        );
        await db.query(
          "UPDATE maintenance SET starts_at=NOW()-INTERVAL '1 hour',ends_at=NOW()+INTERVAL '1 hour' WHERE monitor_id=$1",
          [monitor],
        );
        await runChecks();
        assert.equal(
          (
            await db.query("SELECT id FROM alert_outbox WHERE monitor_id=$1", [
              monitor,
            ])
          ).rowCount,
          1,
        );
      },
    );
    await t.test(
      "invitations enforce matching email, expiry, single use and membership",
      async () => {
        async function accept(id: string, cookie: string) {
          return auth.handler(
            new Request(`${origin}/api/auth/organization/accept-invitation`, {
              method: "POST",
              headers: {
                Cookie: cookie,
                Origin: origin,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ invitationId: id }),
            }),
          );
        }
        const invitation = randomUUID();
        await db.query(
          "INSERT INTO invitation(id,\"organizationId\",email,role,status,\"expiresAt\",\"inviterId\") VALUES($1,$2,$3,'member','pending',NOW()+INTERVAL '1 hour',$4)",
          [invitation, team, outsider.email, owner.id],
        );
        assert.equal((await accept(invitation, memberCookie)).status, 403);
        await db.query(
          "UPDATE invitation SET \"expiresAt\"=NOW()-INTERVAL '1 hour' WHERE id=$1",
          [invitation],
        );
        assert.ok((await accept(invitation, outsiderCookie)).status >= 400);
        await db.query(
          "UPDATE invitation SET \"expiresAt\"=NOW()+INTERVAL '1 hour' WHERE id=$1",
          [invitation],
        );
        assert.equal((await accept(invitation, outsiderCookie)).status, 200);
        assert.ok((await accept(invitation, outsiderCookie)).status >= 400);
        assert.equal((await req(outsiderCookie)).status, 200);
      },
    );
  } finally {
    for (const id of [team, other])
      await db.query("DELETE FROM organization WHERE id=$1", [id]);
    for (const id of ids)
      await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
  }
});
