import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName = "20260803000100_add_send_daily_thanks_rpc.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.send_daily_thanks",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

const getSessionUpdateSql = () => {
  const updates =
    getFunctionSql().match(
      /update public\.daily_sessions[\s\S]*?returning daily_sessions\.id into updated_session_id;/gi,
    ) ?? [];
  assert.equal(updates.length, 1);
  return updates[0];
};

test("send daily thanks migration has the exact signature, encoding, and function attributes", () => {
  const migrationFiles = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrationFiles.includes(migrationName));
  const definingMigrations = migrationFiles.filter((file) =>
    readFileSync(`supabase/migrations/${file}`, "utf8").includes(
      "function public.send_daily_thanks",
    ),
  );
  assert.deepEqual(definingMigrations, [migrationName]);
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  assert.match(
    sql,
    /create or replace function public\.send_daily_thanks\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_expected_version integer\s*\)/i,
  );
  assert.match(getFunctionSql(), /returns jsonb/i);
  assert.match(getFunctionSql(), /language plpgsql/i);
  assert.match(getFunctionSql(), /security invoker/i);
  assert.match(getFunctionSql(), /set search_path = ''/i);
  assert.doesNotMatch(sql, /drop function public\.send_daily_thanks/i);
});

test("send daily thanks execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.send_daily_thanks\(uuid, uuid, date, integer\)\s+from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.send_daily_thanks\(uuid, uuid, date, integer\)\s+from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.send_daily_thanks\(uuid, uuid, date, integer\)\s+from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.send_daily_thanks\(uuid, uuid, date, integer\)\s+to authenticated;/i,
  );
});

test("send daily thanks validates input, authentication, sender membership, and child scope", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionSql,
    /if current_user_id is null[\s\S]*?'status', 'forbidden'/i,
  );
  for (const argument of [
    "p_family_id",
    "p_child_id",
    "p_session_date",
    "p_expected_version",
  ]) {
    assert.match(functionSql, new RegExp(`${argument} is null`, "i"));
  }
  assert.match(functionSql, /p_expected_version < 1/i);
  assert.match(
    functionSql,
    /'status', 'invalid_state'[\s\S]*?'reason', 'invalid_input'[\s\S]*?'session', null/i,
  );
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*?'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /select\s+family_members\.id,\s*family_members\.display_name[\s\S]*?from public\.family_members[\s\S]*?family_members\.family_id = p_family_id[\s\S]*?family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*?children\.id = p_child_id[\s\S]*?children\.family_id = p_family_id/i,
  );
});

test("send daily thanks locks the family-child-date session and returns not found safely", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /from public\.daily_sessions\s+where daily_sessions\.family_id = p_family_id\s+and daily_sessions\.child_id = p_child_id\s+and daily_sessions\.session_date = p_session_date\s+for update;/i,
  );
  assert.match(
    functionSql,
    /if target_session_id is null then[\s\S]*?'status', 'not_found'[\s\S]*?'changed', false[\s\S]*?'session', null/i,
  );
});

test("send daily thanks checks no-op before preparation, recipient, self, and version guards", () => {
  const functionSql = getFunctionSql();
  const lockIndex = functionSql.search(
    /from public\.daily_sessions[\s\S]*?for update;/i,
  );
  const noOpIndex = functionSql.indexOf(
    "if target_session_thanks_sent_at is not null then",
  );
  const preparationIndex = functionSql.indexOf(
    "if target_session_checked_at is null",
  );
  const recipientIndex = functionSql.indexOf(
    "if target_session_prepared_member_id is null then",
  );
  const selfIndex = functionSql.indexOf(
    "if current_member_id = recipient_member_id then",
  );
  const versionIndex = functionSql.indexOf(
    "if target_session_version <> p_expected_version then",
  );

  assert.ok(lockIndex >= 0);
  assert.ok(noOpIndex > lockIndex);
  assert.ok(preparationIndex > noOpIndex);
  assert.ok(recipientIndex > preparationIndex);
  assert.ok(selfIndex > recipientIndex);
  assert.ok(versionIndex > selfIndex);
  assert.match(
    functionSql,
    /if target_session_thanks_sent_at is not null then[\s\S]*?'status', 'success'[\s\S]*?'changed', false[\s\S]*?'reason', null[\s\S]*?'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /if target_session_checked_at is null[\s\S]*?target_session_prepared_at is null[\s\S]*?'reason', 'preparation_incomplete'/i,
  );
  assert.match(
    functionSql,
    /if current_member_id = recipient_member_id then[\s\S]*?'reason', 'self_recipient'[\s\S]*?'session', session_payload/i,
  );
  assert.match(
    functionSql,
    /if target_session_version <> p_expected_version then[\s\S]*?'status', 'conflict'[\s\S]*?'changed', false[\s\S]*?'session', session_payload/i,
  );
});

test("send daily thanks derives the current recipient from the prepared member in the same family", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /daily_sessions\.prepared_by_member_id[\s\S]*?into[\s\S]*?target_session_prepared_member_id/i,
  );
  assert.match(
    functionSql,
    /if target_session_prepared_member_id is null then[\s\S]*?'reason', 'recipient_missing'/i,
  );
  assert.match(
    functionSql,
    /select\s+family_members\.id,\s*family_members\.user_id,\s*family_members\.display_name[\s\S]*?into\s+recipient_member_id,\s*recipient_user_id,\s*recipient_display_name[\s\S]*?from public\.family_members[\s\S]*?family_members\.id = target_session_prepared_member_id[\s\S]*?family_members\.family_id = p_family_id/i,
  );
  assert.match(
    functionSql,
    /if recipient_member_id is null then[\s\S]*?'reason', 'recipient_missing'/i,
  );
});

test("send daily thanks performs one guarded atomic session update with exact snapshots", () => {
  const functionSql = getFunctionSql();
  const updateSql = getSessionUpdateSql();
  const setStart = updateSql.search(/\bset\r?\n/i);
  const setEnd = updateSql.search(/\r?\n\s*where\s/i);
  assert.ok(setStart >= 0);
  assert.ok(setEnd > setStart);
  const setSql = updateSql.slice(setStart, setEnd);

  assert.match(updateSql, /thanks_sent_at = pg_catalog\.now\(\)/i);
  assert.match(updateSql, /thanks_sent_by_member_id = current_member_id/i);
  assert.match(updateSql, /thanks_sent_by_user_id = current_user_id/i);
  assert.match(
    updateSql,
    /thanks_sent_by_display_name = current_member_display_name/i,
  );
  assert.match(
    updateSql,
    /thanks_received_by_member_id = recipient_member_id/i,
  );
  assert.match(
    updateSql,
    /thanks_received_by_user_id = recipient_user_id/i,
  );
  assert.match(
    updateSql,
    /thanks_received_by_display_name = recipient_display_name/i,
  );
  assert.match(updateSql, /version = daily_sessions\.version \+ 1/i);
  assert.match(updateSql, /daily_sessions\.thanks_sent_at is null/i);
  assert.match(updateSql, /daily_sessions\.prepared_at is not null/i);
  assert.match(
    updateSql,
    /daily_sessions\.prepared_by_member_id = recipient_member_id/i,
  );
  assert.match(updateSql, /daily_sessions\.version = p_expected_version/i);
  assert.match(updateSql, /daily_sessions\.version < 2147483647/i);
  assert.match(
    functionSql,
    /if target_session_version = 2147483647 then[\s\S]*?'status', 'invalid_state'[\s\S]*?'changed', false[\s\S]*?'reason', 'invalid_input'/i,
  );
  assert.doesNotMatch(setSql, /updated_at\s*=|checked_|prepared_\w+\s*=/i);
  const allUpdates = functionSql.match(/\bupdate\s+public\.[a-z_]+/gi) ?? [];
  assert.deepEqual(allUpdates.map((statement) => statement.toLowerCase()), [
    "update public.daily_sessions",
  ]);
});

test("send daily thanks returns load-compatible metadata and the required status contract", () => {
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
  for (const status of [
    "success",
    "conflict",
    "forbidden",
    "not_found",
    "invalid_state",
  ]) {
    assert.match(functionSql, new RegExp(`'status', '${status}'`, "i"));
  }
  for (const reason of [
    "invalid_input",
    "preparation_incomplete",
    "recipient_missing",
    "self_recipient",
  ]) {
    assert.match(functionSql, new RegExp(`'reason', '${reason}'`, "i"));
  }
  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*?'changed', true[\s\S]*?'reason', null[\s\S]*?'session', session_payload/i,
  );
});

test("send daily thanks exposes no spoofable actor, recipient, message, or timestamp arguments", () => {
  const declaration = getFunctionSql().match(
    /public\.send_daily_thanks\(([\s\S]*?)\)\s*returns jsonb/i,
  );

  assert.ok(declaration);
  const argumentsSql = declaration[1];

  assert.equal((argumentsSql.match(/\bp_[a-z_]+\b/g) ?? []).length, 4);
  assert.doesNotMatch(
    argumentsSql,
    /session_id|sender|recipient|member_id|user_id|display_name|prepared|message|action|thanks|timestamp/i,
  );
  assert.doesNotMatch(
    getFunctionSql(),
    /pg_notify|http|net\.|realtime|insert into|delete from|drop table|alter table|create table/i,
  );
});
