import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName = "20260805000100_add_atomic_shared_item_delete_rpc.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const originalEnsureSql = readFileSync(
  "supabase/migrations/20260719000600_add_ensure_daily_session_rpc.sql",
  "utf8",
);
const finalCarryoverSql = readFileSync(
  "supabase/migrations/20260726000200_fix_daily_carryover_completion_safety.sql",
  "utf8",
);
const carryoverHardeningSql = readFileSync(
  "supabase/migrations/20260805000200_harden_daily_carryover_references.sql",
  "utf8",
);

const extractFunctionSql = (source: string, functionName: string) => {
  const functionStart = source.indexOf(
    `create or replace function public.${functionName}`,
  );
  assert.ok(functionStart >= 0);
  const functionEnd = source.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);
  return source.slice(functionStart, functionEnd + 3);
};

const getFunctionSql = () =>
  extractFunctionSql(sql, "delete_family_item_template_for_day");

const getEnsureFunctionSql = () =>
  extractFunctionSql(sql, "ensure_daily_session");

const getUpdateSql = (table: "item_templates" | "daily_items") => {
  const functionSql = getFunctionSql();
  const updateStart = functionSql.indexOf(`update public.${table}`);
  assert.ok(updateStart >= 0);
  const updateEnd = functionSql.indexOf(";", updateStart);
  assert.ok(updateEnd > updateStart);
  return functionSql.slice(updateStart, updateEnd + 1);
};

const getSetSql = (updateSql: string) => {
  const setStart = updateSql.search(/\bset\s/i);
  const setEnd = updateSql.search(/\swhere\s/i);
  assert.ok(setStart >= 0);
  assert.ok(setEnd > setStart);
  return updateSql.slice(setStart, setEnd);
};

test("atomic shared item delete migration has the adjusted timestamp-token signature and secure function attributes", () => {
  const migrationFiles = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrationFiles.includes(migrationName));
  const definingMigrations = migrationFiles.filter((file) =>
    /create or replace function public\.delete_family_item_template_for_day\s*\(/i.test(
      readFileSync(`supabase/migrations/${file}`, "utf8"),
    ),
  );
  assert.deepEqual(definingMigrations, [migrationName]);
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  assert.match(
    sql,
    /create or replace function public\.delete_family_item_template_for_day\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_item_template_id uuid,\s*p_expected_template_updated_at timestamptz,\s*p_daily_item_id uuid,\s*p_expected_daily_item_version integer\s*\)/i,
  );
  assert.match(getFunctionSql(), /returns jsonb/i);
  assert.match(getFunctionSql(), /language plpgsql/i);
  assert.match(getFunctionSql(), /security invoker/i);
  assert.match(getFunctionSql(), /set search_path = ''/i);
  assert.doesNotMatch(sql, /drop function|drop table|alter table/i);
});

test("atomic shared item delete execute access is limited to authenticated", () => {
  const signature =
    String.raw`public\.delete_family_item_template_for_day\(\s*uuid,\s*uuid,\s*date,\s*uuid,\s*timestamptz,\s*uuid,\s*integer\s*\)`;
  assert.match(sql, new RegExp(`revoke all on function ${signature} from public;`, "i"));
  assert.match(sql, new RegExp(`revoke all on function ${signature} from anon;`, "i"));
  assert.match(
    sql,
    new RegExp(`revoke all on function ${signature} from authenticated;`, "i"),
  );
  assert.match(
    sql,
    new RegExp(`grant execute on function ${signature} to authenticated;`, "i"),
  );
});

test("atomic shared item delete validates auth, required scope, nullable daily pair, membership, and actor snapshot", () => {
  const functionSql = getFunctionSql();
  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionSql,
    /if current_user_id is null then[\s\S]*?'status', 'forbidden'/i,
  );
  for (const argument of [
    "p_family_id",
    "p_child_id",
    "p_session_date",
    "p_item_template_id",
    "p_expected_template_updated_at",
  ]) {
    assert.match(functionSql, new RegExp(`${argument} is null`, "i"));
  }
  assert.match(
    functionSql,
    /\(p_daily_item_id is null\) <> \(p_expected_daily_item_version is null\)/i,
  );
  assert.match(functionSql, /p_expected_daily_item_version < 1/i);
  assert.match(
    functionSql,
    /'status', 'invalid_state'[\s\S]*?'reason', 'invalid_input'/i,
  );
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*?'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /select\s+family_members\.id,\s*family_members\.display_name[\s\S]*?from public\.family_members[\s\S]*?family_members\.family_id = p_family_id[\s\S]*?family_members\.user_id = current_user_id/i,
  );
});

test("atomic shared item delete locks child synchronization, then session, template, and daily rows in stable order", () => {
  const functionSql = getFunctionSql();
  const childLock = functionSql.search(
    /from public\.children[\s\S]*?children\.id = p_child_id[\s\S]*?children\.family_id = p_family_id[\s\S]*?for update;/i,
  );
  const sessionLock = functionSql.search(
    /from public\.daily_sessions[\s\S]*?daily_sessions\.family_id = p_family_id[\s\S]*?daily_sessions\.child_id = p_child_id[\s\S]*?daily_sessions\.session_date = p_session_date[\s\S]*?for update;/i,
  );
  const templateLock = functionSql.search(
    /from public\.item_templates[\s\S]*?item_templates\.id = p_item_template_id[\s\S]*?item_templates\.family_id = p_family_id[\s\S]*?item_templates\.child_id = p_child_id[\s\S]*?for update;/i,
  );
  const dailyLock = functionSql.search(
    /perform daily_items\.id[\s\S]*?from public\.daily_items[\s\S]*?order by daily_items\.id\s*for update;/i,
  );
  assert.ok(childLock >= 0);
  assert.ok(sessionLock > childLock);
  assert.ok(templateLock > sessionLock);
  assert.ok(dailyLock > templateLock);
});

test("atomic shared item delete serializes existing-session materialization without changing the ensure contract", () => {
  const ensureFunctionSql = getEnsureFunctionSql();
  const previousEnsureFunctionSql = extractFunctionSql(
    originalEnsureSql,
    "ensure_daily_session",
  );
  assert.match(
    ensureFunctionSql,
    /create or replace function public\.ensure_daily_session\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date\s*\)[\s\S]*?returns jsonb[\s\S]*?security invoker[\s\S]*?set search_path = ''/i,
  );
  const sessionInsert = ensureFunctionSql.indexOf(
    "insert into public.daily_sessions",
  );
  const sessionLock = ensureFunctionSql.search(
    /select daily_sessions\.id\s+into target_session_id\s+from public\.daily_sessions\s+where daily_sessions\.family_id = p_family_id\s+and daily_sessions\.child_id = p_child_id\s+and daily_sessions\.session_date = p_session_date\s+for update;/i,
  );
  const dailyInsert = ensureFunctionSql.indexOf(
    "insert into public.daily_items",
  );
  assert.ok(sessionInsert >= 0);
  assert.ok(sessionLock > sessionInsert);
  assert.ok(dailyInsert > sessionLock);
  assert.equal(ensureFunctionSql.match(/\bfor update\b/gi)?.length, 1);
  assert.match(
    ensureFunctionSql,
    /from public\.item_templates[\s\S]*?item_templates\.is_active = true[\s\S]*?on conflict \(daily_session_id, item_template_id\)[\s\S]*?deleted_at is null[\s\S]*?do nothing/i,
  );
  const normalizedLockedEnsure = ensureFunctionSql
    .replace(/\r/g, "")
    .replace(/\n  for update;/i, ";");
  assert.equal(
    normalizedLockedEnsure,
    previousEnsureFunctionSql.replace(/\r/g, ""),
  );
});

test("atomic shared item delete resolves every row from family-child-date-template scope and rejects unrelated daily rows", () => {
  const functionSql = getFunctionSql();
  assert.match(
    functionSql,
    /from public\.daily_sessions[\s\S]*?family_id = p_family_id[\s\S]*?child_id = p_child_id[\s\S]*?session_date = p_session_date/i,
  );
  assert.match(
    functionSql,
    /from public\.item_templates[\s\S]*?id = p_item_template_id[\s\S]*?family_id = p_family_id[\s\S]*?child_id = p_child_id/i,
  );
  assert.match(
    functionSql,
    /active_daily_item_id is not null[\s\S]*?active_daily_item_id <> p_daily_item_id[\s\S]*?'reason', 'daily_item_mismatch'/i,
  );
  assert.match(
    functionSql,
    /target_daily_item_template_id is distinct from p_item_template_id[\s\S]*?target_daily_item_is_ad_hoc[\s\S]*?'reason', 'daily_item_mismatch'/i,
  );
  assert.match(
    functionSql,
    /if target_daily_item_id is null then\s+return pg_catalog\.jsonb_build_object\(\s*'status', 'invalid_state',\s*'changed', false,\s*'reason', 'daily_item_mismatch'/i,
  );
  assert.match(
    functionSql,
    /daily_items\.item_template_id = p_item_template_id[\s\S]*?daily_items\.is_ad_hoc = false[\s\S]*?daily_items\.deleted_at is null/i,
  );
});

test("atomic shared item delete allows a missing session only with a null daily item pair", () => {
  const functionSql = getFunctionSql();
  assert.match(
    functionSql,
    /if target_session_id is null then\s+if p_daily_item_id is not null then[\s\S]*?'status', 'not_found'/i,
  );
  const missingSessionBlock = functionSql.slice(
    functionSql.indexOf("if target_session_id is null then"),
    functionSql.indexOf("else", functionSql.indexOf("if target_session_id is null then")),
  );
  assert.doesNotMatch(missingSessionBlock, /session_completed|carryover_linked/);
});

test("atomic shared item delete uses template updated_at as the optimistic token while preserving inactive retries", () => {
  const functionSql = getFunctionSql();
  const tokenGuard = functionSql.indexOf("if target_template_active");
  const dailyLock = functionSql.indexOf("perform daily_items.id");
  assert.ok(tokenGuard >= 0);
  assert.ok(dailyLock > tokenGuard);
  assert.match(
    functionSql,
    /if target_template_active\s+and target_template_updated_at is distinct from p_expected_template_updated_at[\s\S]*?'status', 'conflict'/i,
  );
  assert.match(
    getUpdateSql("item_templates"),
    /item_templates\.updated_at = p_expected_template_updated_at/i,
  );
});

test("atomic shared item delete checks active item version, overflow, completion, and carryover before either update", () => {
  const functionSql = getFunctionSql();
  const versionGuard = functionSql.indexOf(
    "if target_daily_item_version <> p_expected_daily_item_version then",
  );
  const overflowGuard = functionSql.indexOf(
    "if target_daily_item_version >= 2147483647 then",
  );
  const completionGuard = functionSql.indexOf(
    "if target_session_prepared_at is not null",
  );
  const carryoverGuard = functionSql.indexOf(
    "if target_daily_item_is_carryover",
  );
  const templateUpdate = functionSql.indexOf("update public.item_templates");
  assert.ok(completionGuard >= 0);
  assert.ok(versionGuard > completionGuard);
  assert.ok(overflowGuard > versionGuard);
  assert.ok(carryoverGuard > overflowGuard);
  assert.ok(templateUpdate > carryoverGuard);
  assert.match(
    functionSql,
    /target_daily_item_version <> p_expected_daily_item_version[\s\S]*?'status', 'conflict'/i,
  );
  assert.match(
    functionSql,
    /target_session_prepared_at is not null\s+and \(\s*target_template_active\s+or active_daily_item_id is not null\s*\)[\s\S]*?'reason', 'session_completed'/i,
  );
  assert.match(
    functionSql,
    /target_daily_item_is_carryover[\s\S]*?target_daily_item_carried_from_id is not null[\s\S]*?target_daily_item_processed_at is not null[\s\S]*?target_daily_item_resolved_at is not null[\s\S]*?target_daily_item_is_deferred[\s\S]*?not target_daily_item_is_prepared[\s\S]*?referring_items\.carried_from_daily_item_id = target_daily_item_id[\s\S]*?'reason', 'carryover_linked'/i,
  );
});

test("atomic shared item delete composes with global carryover reference hardening", () => {
  const functionSql = getFunctionSql();
  const carryoverFunctionSql = extractFunctionSql(
    finalCarryoverSql,
    "process_daily_carryovers",
  );
  const hardeningFunctionSql = extractFunctionSql(
    carryoverHardeningSql,
    "validate_daily_carryover_references",
  );
  const deleteDailyLock = functionSql.search(
    /perform daily_items\.id[\s\S]*?from public\.daily_items[\s\S]*?daily_items\.id = p_daily_item_id[\s\S]*?order by daily_items\.id\s*for update;/i,
  );
  const referenceGuard = functionSql.search(
    /exists \(\s*select 1\s*from public\.daily_items as referring_items\s*where referring_items\.carried_from_daily_item_id = target_daily_item_id\s*\)/i,
  );
  const dailyUpdate = functionSql.indexOf("update public.daily_items");
  assert.ok(deleteDailyLock >= 0);
  assert.ok(referenceGuard > deleteDailyLock);
  assert.ok(dailyUpdate > referenceGuard);

  const sourceClaimLock = carryoverFunctionSql.search(
    /from public\.daily_items as source_items[\s\S]*?source_items\.deleted_at is null[\s\S]*?source_items\.is_deferred = true[\s\S]*?source_items\.is_prepared = false[\s\S]*?source_items\.carryover_processed_at is null[\s\S]*?source_items\.carryover_resolved_at is null[\s\S]*?order by source_sessions\.session_date, source_items\.id\s*for update of source_items skip locked;/i,
  );
  assert.ok(sourceClaimLock >= 0);
  const referenceWrites = [
    ...carryoverFunctionSql.matchAll(/carried_from_daily_item_id\s*=/gi),
  ];
  assert.ok(referenceWrites.length > 0);
  for (const referenceWrite of referenceWrites) {
    assert.ok((referenceWrite.index ?? -1) > sourceClaimLock);
  }

  assert.match(hardeningFunctionSql, /security definer/i);
  assert.match(hardeningFunctionSql, /set search_path = ''/i);
  assert.match(
    carryoverHardeningSql,
    /after update on public\.daily_items\s+referencing old table as previous_rows new table as updated_rows\s+for each statement/i,
  );
  assert.match(
    hardeningFunctionSql,
    /from public\.daily_items as source_items[\s\S]*?order by source_items\.id\s+for update(?: nowait)?;[\s\S]*?source_items\.deleted_at is not null/i,
  );
  assert.match(
    hardeningFunctionSql,
    /from updated_rows as source_items\s+join public\.daily_items as destination_items\s+on destination_items\.carried_from_daily_item_id = source_items\.id[\s\S]*?source_items\.deleted_at is not null/i,
  );
  assert.match(
    carryoverHardeningSql,
    /revoke delete on table public\.daily_items from authenticated;/i,
  );
  assert.doesNotMatch(
    carryoverHardeningSql,
    /revoke (insert|update) on table public\.daily_items from authenticated/i,
  );
});

test("atomic shared item delete only soft deactivates the template", () => {
  const updateSql = getUpdateSql("item_templates");
  const setSql = getSetSql(updateSql);
  assert.match(setSql, /is_active = false/i);
  assert.match(setSql, /updated_at = operation_at/i);
  assert.doesNotMatch(
    setSql,
    /name|kind|default_quantity|unit|weekday|sort_order|current_rough_state|child_id|family_id/i,
  );
  assert.match(updateSql, /item_templates\.id = target_template_id/i);
  assert.match(updateSql, /item_templates\.family_id = p_family_id/i);
  assert.match(updateSql, /item_templates\.child_id = p_child_id/i);
  assert.match(updateSql, /item_templates\.is_active = true/i);
});

test("atomic shared item delete updates exactly the daily soft-delete, actor, timestamp, and version fields", () => {
  const updateSql = getUpdateSql("daily_items");
  const setSql = getSetSql(updateSql);
  for (const assignment of [
    /deleted_at = operation_at/i,
    /updated_at = operation_at/i,
    /updated_by_member_id = current_member_id/i,
    /updated_by_user_id = current_user_id/i,
    /updated_by_display_name = current_member_display_name/i,
    /version = daily_items\.version \+ 1/i,
  ]) {
    assert.match(setSql, assignment);
  }
  assert.doesNotMatch(
    setSql,
    /observed_quantity|required_quantity|shortage_count|is_prepared|is_deferred|is_checked|is_carryover|carried_from|carryover_processed|carryover_resolved|created_at|daily_session_id|item_template_id|family_id/i,
  );
  assert.match(updateSql, /daily_items\.version = p_expected_daily_item_version/i);
  assert.match(updateSql, /daily_items\.version < 2147483647/i);
  assert.match(updateSql, /daily_items\.deleted_at is null/i);
});

test("atomic shared item delete has one guarded update per target, no physical delete, and no session mutation", () => {
  const functionSql = getFunctionSql();
  const updates = functionSql.match(/\bupdate\s+public\.[a-z_]+/gi) ?? [];
  assert.deepEqual(updates.map((value) => value.toLowerCase()), [
    "update public.item_templates",
    "update public.daily_items",
  ]);
  assert.doesNotMatch(functionSql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(functionSql, /update public\.daily_sessions/i);
  assert.doesNotMatch(functionSql, /daily_sessions\.version\s*[=+]/i);
  assert.doesNotMatch(functionSql, /insert into|truncate|create table|alter table|drop table/i);
});

test("atomic shared item delete returns consistent metadata, outcomes, reasons, and retry-safe changed semantics", () => {
  const functionSql = getFunctionSql();
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
    "daily_item_mismatch",
    "session_completed",
    "carryover_linked",
  ]) {
    assert.match(functionSql, new RegExp(`'reason', '${reason}'`, "i"));
  }
  for (const key of [
    "id",
    "family_id",
    "child_id",
    "is_active",
    "updated_at",
    "daily_item_id",
    "daily_session_id",
    "session_date",
    "item_template_id",
    "version",
    "deleted_at",
    "updated_by_member_id",
    "updated_by_user_id",
    "updated_by_display_name",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }
  assert.match(
    functionSql,
    /'status', 'success',\s*'changed', updated_template_id is not null or updated_daily_item_id is not null,\s*'reason', null,\s*'template', template_payload,\s*'daily_item', daily_item_payload/i,
  );
  assert.doesNotMatch(functionSql, /'items'/i);
});

test("atomic shared item delete performs no business return after a successful template update and relies on transaction rollback for impossible write failure", () => {
  const functionSql = getFunctionSql();
  const templateReturning = functionSql.indexOf(
    "returning item_templates.id into updated_template_id;",
  );
  const dailyUpdate = functionSql.indexOf("update public.daily_items");
  const impossibleDailyFailure = functionSql.indexOf(
    "raise exception 'atomic_daily_item_delete_failed'",
  );
  const impossibleTemplateFailure = functionSql.indexOf(
    "raise exception 'atomic_item_template_delete_failed'",
  );
  assert.ok(templateReturning >= 0);
  assert.ok(impossibleTemplateFailure > templateReturning);
  assert.ok(dailyUpdate > templateReturning);
  assert.ok(impossibleDailyFailure > dailyUpdate);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("atomic shared item delete uses only schema-qualified database references and contains no external effects or secrets", () => {
  const functionSql = getFunctionSql();
  for (const relation of [
    "family_members",
    "children",
    "daily_sessions",
    "item_templates",
    "daily_items",
  ]) {
    assert.match(functionSql, new RegExp(`public\\.${relation}`, "i"));
  }
  assert.doesNotMatch(
    functionSql,
    /pg_notify|http|net\.|realtime|service_role|private key|secret/i,
  );
  assert.doesNotMatch(
    functionSql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});
