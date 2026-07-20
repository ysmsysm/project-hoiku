import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000500_add_complete_daily_check_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.complete_daily_check",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

const getUpdateSql = () => {
  const functionSql = getFunctionSql();
  const updateStatements =
    functionSql.match(
      /update public\.daily_sessions[\s\S]*?returning daily_sessions\.id into updated_session_id;/gi,
    ) ?? [];

  assert.equal(updateStatements.length, 1);
  return updateStatements[0];
};

test("daily check complete RPC migration is present with expected signature and security", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(
    migrations.includes("20260719000500_add_complete_daily_check_rpc.sql"),
  );
  assert.match(
    sql,
    /create or replace function public\.complete_daily_check\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_expected_version integer\s*\)/i,
  );
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
});

test("daily check complete RPC execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_check\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\)\s+from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_check\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\)\s+from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.complete_daily_check\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\)\s+from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.complete_daily_check\(\s*uuid,\s*uuid,\s*date,\s*integer\s*\)\s+to authenticated;/i,
  );
});

test("daily check complete RPC checks auth, membership, operator snapshot, child, and session scope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionSql,
    /if current_user_id is null[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /select\s+family_members\.id,\s*family_members\.display_name[\s\S]*from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
  assert.match(
    functionSql,
    /from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date/i,
  );
});

test("daily check complete RPC validates required arguments and expected version", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_family_id is null/i);
  assert.match(functionSql, /p_child_id is null/i);
  assert.match(functionSql, /p_session_date is null/i);
  assert.match(functionSql, /p_expected_version is null/i);
  assert.match(
    functionSql,
    /if p_expected_version < 1[\s\S]*'status', 'invalid_state'/i,
  );
});

test("daily check complete RPC returns load_daily_data-compatible session payload without items", () => {
  const functionSql = getFunctionSql();

  for (const key of [
    "id",
    "session_id",
    "family_id",
    "child_id",
    "session_date",
    "version",
    "is_checked",
    "checked_by_member_id",
    "checked_by_user_id",
    "checked_by_display_name",
    "checked_at",
    "is_prepared",
    "prepared_by_member_id",
    "prepared_by_user_id",
    "prepared_by_display_name",
    "prepared_at",
    "thanks_sent_at",
    "thanks_sent_by_member_id",
    "thanks_sent_by_user_id",
    "thanks_sent_by_display_name",
    "thanks_received_by_member_id",
    "thanks_received_by_user_id",
    "thanks_received_by_display_name",
    "created_at",
    "updated_at",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }

  assert.doesNotMatch(functionSql, /'items'/i);
});

test("daily check complete RPC returns not_found when the scoped session does not exist", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /select\s+daily_sessions\.id,\s*daily_sessions\.checked_at,\s*daily_sessions\.version[\s\S]*where daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date/i,
  );
  assert.match(
    functionSql,
    /if target_session_id is null then[\s\S]*'status', 'not_found'[\s\S]*'session', null/i,
  );
});

test("daily check complete RPC uses expected-version conflict handling and returns latest session", () => {
  const functionSql = getFunctionSql();
  const updateSql = getUpdateSql();

  assert.match(
    functionSql,
    /if target_session_version <> p_expected_version then[\s\S]*'status', 'conflict'[\s\S]*'session', session_payload/i,
  );
  assert.match(updateSql, /daily_sessions\.version = p_expected_version/i);
  assert.match(
    functionSql,
    /if updated_session_id is null then[\s\S]*'status', 'conflict'[\s\S]*'session', session_payload/i,
  );
});

test("daily check complete RPC only updates first unchecked completion and increments version once", () => {
  const functionSql = getFunctionSql();
  const updateSql = getUpdateSql();

  assert.match(
    functionSql,
    /if target_session_checked_at is null then[\s\S]*update public\.daily_sessions/i,
  );
  assert.match(updateSql, /checked_at = now\(\)/i);
  assert.match(updateSql, /checked_by_member_id = current_member_id/i);
  assert.match(updateSql, /checked_by_user_id = current_user_id/i);
  assert.match(
    updateSql,
    /checked_by_display_name = current_member_display_name/i,
  );
  assert.match(updateSql, /version = daily_sessions\.version \+ 1/i);
  assert.match(updateSql, /daily_sessions\.checked_at is null/i);
});

test("daily check complete RPC treats already checked sessions as idempotent success without updating", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /if target_session_checked_at is null then[\s\S]*update public\.daily_sessions[\s\S]*end if;/i,
  );
  assert.match(
    functionSql,
    /return pg_catalog\.jsonb_build_object\(\s*'status', 'success',\s*'session', session_payload\s*\)/i,
  );
  assert.equal(
    (
      functionSql.match(
        /update public\.daily_sessions[\s\S]*?returning daily_sessions\.id into updated_session_id;/gi,
      ) ?? []
    ).length,
    1,
  );
});

test("daily check complete RPC does not touch daily items or unrelated session responsibilities", () => {
  const functionSql = getFunctionSql();
  const updateSql = getUpdateSql();

  assert.doesNotMatch(functionSql, /\binsert\s+into\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(functionSql, /update public\.daily_items/i);
  assert.doesNotMatch(functionSql, /public\.daily_items|\bdaily_items\b/i);
  assert.doesNotMatch(updateSql, /is_checked\s*=/i);
  assert.doesNotMatch(updateSql, /prepared_|thanks_|carryover/i);
  assert.doesNotMatch(updateSql, /updated_at\s*=/i);
});

test("daily check complete RPC has status envelopes for success, conflict, forbidden, not_found, and invalid_state", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /'status', 'conflict'[\s\S]*'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /'status', 'forbidden'[\s\S]*'session', null/i,
  );
  assert.match(
    functionSql,
    /'status', 'not_found'[\s\S]*'session', null/i,
  );
  assert.match(
    functionSql,
    /'status', 'invalid_state'[\s\S]*'session', null/i,
  );
});
