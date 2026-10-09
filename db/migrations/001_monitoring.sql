CREATE TABLE monitor (
 id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 name TEXT NOT NULL, url TEXT NOT NULL, interval_seconds INTEGER NOT NULL DEFAULT 300 CHECK(interval_seconds BETWEEN 60 AND 86400),
 enabled BOOLEAN NOT NULL DEFAULT TRUE, is_public BOOLEAN NOT NULL DEFAULT FALSE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','up','down')),
 next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ, lease_token TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(id,team_id));
CREATE INDEX monitor_due ON monitor(next_check_at) WHERE enabled;
CREATE TABLE monitor_check (
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL REFERENCES monitor(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('up','down')), response_ms INTEGER NOT NULL, status_code INTEGER,
 error TEXT, checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX checks_history ON monitor_check(monitor_id,checked_at DESC);
CREATE TABLE incident (
 id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 monitor_id TEXT, title TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('minor','major','critical')),
 state TEXT NOT NULL DEFAULT 'investigating' CHECK(state IN ('investigating','identified','monitoring','resolved')),
 assignee_id TEXT REFERENCES "user"(id) ON DELETE SET NULL, is_public BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ,
 FOREIGN KEY(monitor_id,team_id) REFERENCES monitor(id,team_id) ON DELETE CASCADE);
CREATE TABLE incident_update (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incident(id) ON DELETE CASCADE,
 author_id TEXT REFERENCES "user"(id) ON DELETE SET NULL, body TEXT NOT NULL, state TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE maintenance (
 id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 monitor_id TEXT NOT NULL, title TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 CHECK(ends_at>starts_at), FOREIGN KEY(monitor_id,team_id) REFERENCES monitor(id,team_id) ON DELETE CASCADE);
CREATE TABLE status_page (
 team_id TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
 slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, published BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE alert_outbox (
 id TEXT PRIMARY KEY, monitor_id TEXT NOT NULL REFERENCES monitor(id) ON DELETE CASCADE,
 recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, sent_at TIMESTAMPTZ,
 lease_until TIMESTAMPTZ, lease_token TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE write_limit (user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, bucket BIGINT NOT NULL, count INTEGER NOT NULL);
