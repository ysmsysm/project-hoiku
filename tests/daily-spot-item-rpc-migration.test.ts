import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "supabase/migrations/20260815000100_add_daily_spot_item_rpc.sql";
const sql = readFileSync(path, "utf8");
const start = sql.indexOf("create or replace function public.mutate_daily_spot_item");
const end = sql.indexOf("$$;", start);
const fn = sql.slice(start, end + 3);

test("daily spot migration is BOM-free and exposes one authenticated JSON RPC", () => {
  assert.equal(sql.charCodeAt(0) === 0xfeff, false);
  assert.ok(start >= 0 && end > start);
  assert.match(fn, /returns jsonb[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.match(sql, /grant execute on function public\.mutate_daily_spot_item\([\s\S]*to authenticated;/i);
  assert.match(sql, /revoke all on function public\.mutate_daily_spot_item\([\s\S]*from public;/i);
  assert.match(sql, /revoke all on function public\.mutate_daily_spot_item\([\s\S]*from anon;/i);
});

test("daily spot RPC authenticates family-child-date scope and locks session first", () => {
  assert.match(fn, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(fn, /public\.is_family_member\(p_family_id\)/i);
  assert.match(fn, /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i);
  const sessionLock = fn.search(/from public\.daily_sessions[\s\S]*daily_sessions\.session_date = p_session_date[\s\S]*for update;/i);
  const itemLock = fn.search(/from public\.daily_items[\s\S]*for update;/i);
  const templateLock = fn.search(/from public\.item_templates[\s\S]*for update;/i);
  assert.ok(sessionLock >= 0 && itemLock > sessionLock && templateLock > sessionLock);
  assert.match(fn, /if target_session_prepared then[\s\S]*'reason', 'session_prepared'/i);
});

test("add paths are spot-only and retry-safe without changing durable templates", () => {
  assert.match(fn, /p_action = 'add_template'[\s\S]*item_templates\.kind = 'spot'[\s\S]*item_templates\.is_active = true/i);
  assert.match(fn, /daily_items\.item_template_id = p_item_template_id[\s\S]*daily_items\.deleted_at is null[\s\S]*for update/i);
  assert.match(fn, /p_action = 'add_temporary'[\s\S]*where daily_items\.id = p_daily_item_id[\s\S]*for update/i);
  assert.match(fn, /'reason', 'idempotency_mismatch'/i);
  assert.match(fn, /p_daily_item_id, p_family_id, target_session_id, null, 'spot'/i);
  assert.doesNotMatch(fn, /update public\.item_templates|delete from public\.item_templates/i);
});

test("delete is versioned soft delete and preserves carryover links", () => {
  assert.match(fn, /target_item\.version <> p_expected_version[\s\S]*'status', 'conflict'/i);
  assert.match(fn, /p_action = 'delete'[\s\S]*target_item\.carried_from_daily_item_id is not null[\s\S]*referring_items\.carried_from_daily_item_id = target_item\.id[\s\S]*'carryover_linked'/i);
  assert.match(fn, /update public\.daily_items[\s\S]*deleted_at = pg_catalog\.clock_timestamp\(\)[\s\S]*version = daily_items\.version \+ 1/i);
  assert.doesNotMatch(fn, /delete\s+from\s+public\.daily_items/i);
});

test("due date set and clear cover template-backed and ad-hoc active spot rows", () => {
  assert.match(fn, /p_action not in \('add_template', 'add_temporary', 'delete', 'set_due_date'\)/i);
  assert.match(fn, /daily_items\.kind = 'spot'[\s\S]*daily_items\.deleted_at is null[\s\S]*for update/i);
  assert.match(fn, /target_item\.due_date is distinct from p_due_date[\s\S]*set due_date = p_due_date/i);
  const dueStart = fn.indexOf("if target_item.due_date is distinct from p_due_date");
  const dueBranch = fn.slice(dueStart, fn.indexOf("inserted_item_id := target_item.id", dueStart));
  assert.doesNotMatch(dueBranch, /target_item\.is_ad_hoc|target_item\.item_template_id/);
});

test("actor and timestamps are server-owned and every outcome uses a safe envelope", () => {
  assert.match(fn, /updated_by_member_id = current_member_id[\s\S]*updated_by_user_id = current_user_id[\s\S]*updated_by_display_name = current_member_display_name/i);
  assert.doesNotMatch(fn, /p_(?:actor|user|member|updated_at|deleted_at)/i);
  for (const status of ["success", "conflict", "forbidden", "not_found", "invalid_state"]) {
    assert.match(fn, new RegExp(`'status', '${status}'`, "i"));
  }
});
