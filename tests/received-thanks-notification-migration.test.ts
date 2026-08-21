import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260821000600_add_received_thanks_notification_consume.sql";
const bytes = readFileSync(migrationPath);
const sql = bytes.toString("utf8");

test("received thanks consume migration is ordered, transactional and BOM-free", () => {
  assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /create table public\.daily_thanks_notification_receipts/);
  assert.match(
    sql,
    /primary key \(\s*daily_session_id,\s*thanks_sent_at,\s*receiver_member_id\s*\)/,
  );
});

test("consume RPC authenticates and locks the scoped daily session before receipt insert", () => {
  assert.match(
    sql,
    /create or replace function public\.consume_daily_thanks_notification\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_daily_session_id uuid,\s*p_thanks_sent_at timestamptz\s*\)/,
  );
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(
    sql,
    /from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/,
  );
  assert.match(
    sql,
    /from public\.daily_sessions[\s\S]*daily_sessions\.id = p_daily_session_id[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date[\s\S]*for update;/,
  );
  assert.ok(
    sql.indexOf("for update;") <
      sql.indexOf("insert into public.daily_thanks_notification_receipts"),
  );
});

test("only the snapshotted receiver can atomically consume one thanks event", () => {
  assert.match(
    sql,
    /target_receiver_member_id <> current_member_id[\s\S]*target_receiver_user_id <> current_user_id/,
  );
  assert.match(sql, /target_thanks_sent_at <> p_thanks_sent_at/);
  assert.match(
    sql,
    /on conflict \(\s*daily_session_id,\s*thanks_sent_at,\s*receiver_member_id\s*\) do nothing/,
  );
  assert.match(
    sql,
    /'should_display', inserted_receiver_member_id is not null/,
  );
  assert.doesNotMatch(sql, /update public\.daily_sessions/);
});

test("receipt storage is private and only the authenticated RPC is executable", () => {
  assert.match(
    sql,
    /alter table public\.daily_thanks_notification_receipts enable row level security/,
  );
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(
    sql,
    /revoke all on table public\.daily_thanks_notification_receipts from authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.consume_daily_thanks_notification\([\s\S]*?\) to authenticated/,
  );
});
