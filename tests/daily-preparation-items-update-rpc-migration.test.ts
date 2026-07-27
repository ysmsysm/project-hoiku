import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName =
  "20260727000100_add_update_daily_preparation_items_rpc.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const schemaSql = readFileSync(
  "supabase/migrations/20260719000100_expand_daily_sharing_schema.sql",
  "utf8",
);

const getFunctionSql = () => {
  const functionStart = sql.indexOf(
    "create or replace function public.update_daily_preparation_items",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

const assertMarkersInOrder = (source: string, markers: string[]) => {
  let previousIndex = -1;

  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    assert.ok(markerIndex >= 0, `missing marker: ${marker}`);
    assert.ok(
      markerIndex > previousIndex,
      `marker is out of order: ${marker}`,
    );
    previousIndex = markerIndex;
  }
};

test("batch preparation item migration is new, UTF-8 without BOM, and has the exact secure signature", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(migrations.includes(migrationName));
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  assert.match(
    sql,
    /create or replace function public\.update_daily_preparation_items\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_session_date date,\s*p_updates jsonb\s*\)/i,
  );
  assert.match(getFunctionSql(), /returns jsonb/i);
  assert.match(getFunctionSql(), /security invoker/i);
  assert.match(getFunctionSql(), /set search_path = ''/i);
  assert.doesNotMatch(sql, /drop function/i);
});

test("batch preparation item execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.update_daily_preparation_items\(\s*uuid,\s*uuid,\s*date,\s*jsonb\s*\) from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.update_daily_preparation_items\(\s*uuid,\s*uuid,\s*date,\s*jsonb\s*\) from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.update_daily_preparation_items\(\s*uuid,\s*uuid,\s*date,\s*jsonb\s*\) from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.update_daily_preparation_items\(\s*uuid,\s*uuid,\s*date,\s*jsonb\s*\) to authenticated;/i,
  );
});

test("batch preparation item input is an exact, bounded array contract with explicit empty success", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /p_updates is null[\s\S]*jsonb_typeof\(p_updates\) <> 'array'/i,
  );
  assert.match(
    functionSql,
    /requested_count := pg_catalog\.jsonb_array_length\(p_updates\)/i,
  );
  assert.match(
    functionSql,
    /if requested_count > 100[\s\S]*'reason', 'too_many_updates'/i,
  );
  assert.match(
    functionSql,
    /jsonb_typeof\(update_elements\.value\) <> 'object'/i,
  );
  for (const key of ["daily_item_id", "expected_version", "is_prepared"]) {
    assert.match(functionSql, new RegExp(`value \\? '${key}'`, "i"));
  }
  assert.match(
    functionSql,
    /update_keys\.key not in \(\s*'daily_item_id',\s*'expected_version',\s*'is_prepared'\s*\)/i,
  );
  assert.match(
    functionSql,
    /jsonb_typeof\(\s*update_elements\.value -> 'is_prepared'\s*\) <> 'boolean'/i,
  );
  assert.match(
    functionSql,
    /jsonb_typeof\(\s*update_elements\.value -> 'expected_version'\s*\) <> 'number'/i,
  );
  assert.match(
    functionSql,
    /update_elements\.value ->> 'expected_version'\) !~ '\^\[1-9\]\[0-9\]\*\$'/i,
  );
  assert.match(
    functionSql,
    /update_elements\.value ->> 'daily_item_id'\) !~\s*'\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$'/i,
  );
  assert.match(
    functionSql,
    /char_length\(\s*update_elements\.value ->> 'expected_version'\s*\) = 10[\s\S]*update_elements\.value ->> 'expected_version'\) > '2147483647'/i,
  );
  assert.match(
    functionSql,
    /having pg_catalog\.count\(\*\) > 1[\s\S]*'reason', 'duplicate_daily_item_id'/i,
  );
  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*'unchanged_count', requested_count - changed_count/i,
  );
});

test("batch preparation item validates UUID, integer, and boolean values before their first casts", () => {
  const functionSql = getFunctionSql();
  const validationMarker =
    "where not (update_elements.value ? 'daily_item_id')";
  const validationStart = functionSql.lastIndexOf(
    "if exists (",
    functionSql.indexOf(validationMarker),
  );
  const validationEnd = functionSql.indexOf("end if;", validationStart);
  const validationSql = functionSql.slice(
    validationStart,
    validationEnd + "end if;".length,
  );
  const firstUuidCast = functionSql.indexOf("::uuid", validationEnd);
  const firstIntegerCast = functionSql.indexOf("::integer", validationEnd);
  const firstBooleanCast = functionSql.indexOf("::boolean", validationEnd);

  assert.ok(validationStart >= 0);
  assert.ok(validationEnd > validationStart);
  assert.match(
    validationSql,
    /daily_item_id'\) !~\s*'\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$'/i,
  );
  assert.match(
    validationSql,
    /expected_version'\) !~ '\^\[1-9\]\[0-9\]\*\$'/i,
  );
  assert.match(validationSql, /> '2147483647'/i);
  assert.match(
    validationSql,
    /jsonb_typeof\(\s*update_elements\.value -> 'is_prepared'\s*\) <> 'boolean'/i,
  );
  assert.ok(firstUuidCast > validationEnd);
  assert.ok(firstIntegerCast > validationEnd);
  assert.ok(firstBooleanCast > validationEnd);
});

test("batch preparation item empty arrays reach zero-count success only after authorization and unprepared session checks", () => {
  const functionSql = getFunctionSql();
  const countIndex = functionSql.indexOf(
    "requested_count := pg_catalog.jsonb_array_length(p_updates);",
  );
  const membershipIndex = functionSql.indexOf(
    "if not public.is_family_member(p_family_id) then",
  );
  const memberIndex = functionSql.indexOf("from public.family_members");
  const childIndex = functionSql.indexOf("from public.children");
  const sessionLockIndex = functionSql.search(
    /from public\.daily_sessions[\s\S]*?for update;/i,
  );
  const preparedIndex = functionSql.indexOf(
    "if target_session_prepared_at is not null then",
  );
  const successIndex = functionSql.lastIndexOf(
    "return pg_catalog.jsonb_build_object(",
  );
  const beforeSessionLock = functionSql.slice(countIndex, sessionLockIndex);

  assertMarkersInOrder(functionSql, [
    "requested_count := pg_catalog.jsonb_array_length(p_updates);",
    "if not public.is_family_member(p_family_id) then",
    "from public.family_members",
    "from public.children",
    "from public.daily_sessions",
    "if target_session_id is null then",
    "if target_session_prepared_at is not null then",
  ]);
  assert.ok(countIndex >= 0);
  assert.ok(membershipIndex > countIndex);
  assert.ok(memberIndex > membershipIndex);
  assert.ok(childIndex > memberIndex);
  assert.ok(sessionLockIndex > childIndex);
  assert.ok(preparedIndex > sessionLockIndex);
  assert.ok(successIndex > preparedIndex);
  assert.doesNotMatch(
    beforeSessionLock,
    /if requested_count = 0[\s\S]*'status', 'success'/i,
  );
  assert.match(
    functionSql.slice(preparedIndex, successIndex),
    /if target_session_prepared_at is not null then[\s\S]*'status', 'invalid_state'/i,
  );
  assert.match(functionSql, /changed_count integer := 0/i);
  assert.match(
    functionSql.slice(successIndex),
    /'requested_count', requested_count[\s\S]*'changed_count', changed_count[\s\S]*'unchanged_count', requested_count - changed_count/i,
  );
});

test("batch preparation item auth and family-child-date scope follow existing daily RPCs", () => {
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
    /from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
  assert.match(
    functionSql,
    /from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_session_date[\s\S]*for update;/i,
  );
});

test("batch preparation item locks the session first and requested active items in stable UUID order", () => {
  const functionSql = getFunctionSql();
  const sessionLockIndex = functionSql.search(
    /from public\.daily_sessions[\s\S]*?for update;/i,
  );
  const itemLockIndex = functionSql.search(
    /perform daily_items\.id[\s\S]*?order by daily_items\.id\s*for update of daily_items;/i,
  );
  const sessionNotFoundIndex = functionSql.indexOf(
    "if target_session_id is null then",
  );
  const preparedIndex = functionSql.indexOf(
    "if target_session_prepared_at is not null then",
  );

  assert.ok(sessionLockIndex >= 0);
  assert.ok(sessionNotFoundIndex > sessionLockIndex);
  assert.ok(preparedIndex > sessionNotFoundIndex);
  assert.ok(itemLockIndex > preparedIndex);
  assert.match(
    functionSql,
    /perform daily_items\.id[\s\S]*daily_items\.family_id = p_family_id[\s\S]*daily_items\.daily_session_id = target_session_id[\s\S]*daily_items\.deleted_at is null[\s\S]*order by daily_items\.id\s*for update of daily_items;/i,
  );
});

test("batch preparation item rejects missing sessions, prepared sessions, and missing, deleted, or out-of-scope items", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /if target_session_id is null then[\s\S]*'status', 'not_found'[\s\S]*'reason', 'session_not_found'/i,
  );
  assert.match(
    functionSql,
    /if target_session_prepared_at is not null then[\s\S]*'status', 'invalid_state'[\s\S]*'reason', 'session_prepared'/i,
  );
  assert.match(
    functionSql,
    /select pg_catalog\.count\(\*\)\s*into locked_count[\s\S]*daily_items\.family_id = p_family_id[\s\S]*daily_items\.daily_session_id = target_session_id[\s\S]*daily_items\.deleted_at is null/i,
  );
  assert.match(
    functionSql,
    /if locked_count <> requested_count then[\s\S]*'status', 'not_found'[\s\S]*'reason', 'daily_item_not_found'/i,
  );
});

test("batch preparation item validates all versions before the sole update and returns actionable conflicts", () => {
  const functionSql = getFunctionSql();
  const conflictSelectStart = functionSql.indexOf(
    "select",
    functionSql.indexOf("-- Validate every expected version"),
  );
  const conflictCheckIndex = functionSql.indexOf("if conflict_count > 0 then");
  const updateIndex = functionSql.indexOf("update public.daily_items");
  const conflictSql = functionSql.slice(
    conflictSelectStart,
    conflictCheckIndex,
  );
  const updates =
    functionSql.match(/\bupdate public\.daily_items\b/gi) ?? [];

  assert.equal(updates.length, 1);
  assert.ok(conflictSelectStart >= 0);
  assert.ok(conflictCheckIndex >= 0);
  assert.ok(updateIndex > conflictCheckIndex);
  assert.match(
    functionSql,
    /daily_items\.version <> requested_updates\.expected_version/i,
  );
  assert.match(
    functionSql,
    /if conflict_count > 0 then[\s\S]*'status', 'conflict'[\s\S]*'changed_count', 0[\s\S]*'conflicts', conflict_payloads/i,
  );
  for (const key of [
    "daily_item_id",
    "expected_version",
    "current_version",
    "is_prepared",
    "is_deferred",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }
  assert.match(conflictSql, /pg_catalog\.jsonb_agg\(/i);
  assert.match(conflictSql, /order by daily_items\.id/i);
  assert.doesNotMatch(conflictSql, /\blimit\s+1\b/i);
});

test("batch preparation item updates only changed rows with paired deferred behavior and operator snapshots", () => {
  const functionSql = getFunctionSql();
  const updateSql = functionSql.match(
    /update public\.daily_items[\s\S]*?returning daily_items\.id/i,
  )?.[0];

  assert.ok(updateSql);
  assert.match(
    updateSql,
    /is_prepared = requested_updates\.is_prepared/i,
  );
  assert.match(
    updateSql,
    /is_deferred = case\s*when requested_updates\.is_prepared then false\s*else daily_items\.is_deferred\s*end/i,
  );
  assert.match(
    updateSql,
    /daily_items\.is_prepared is distinct from requested_updates\.is_prepared[\s\S]*requested_updates\.is_prepared[\s\S]*daily_items\.is_deferred/i,
  );
  assert.match(updateSql, /daily_items\.version = requested_updates\.expected_version/i);
  assert.match(updateSql, /version = daily_items\.version \+ 1/i);
  assert.match(updateSql, /updated_by_member_id = current_member_id/i);
  assert.match(updateSql, /updated_by_user_id = current_user_id/i);
  assert.match(
    updateSql,
    /updated_by_display_name = current_member_display_name/i,
  );
  assert.match(updateSql, /updated_at = mutation_at/i);
});

test("batch preparation item change predicate matches all five prepared and deferred no-op cases", () => {
  const functionSql = getFunctionSql();
  const updateSql = functionSql.match(
    /update public\.daily_items[\s\S]*?returning daily_items\.id/i,
  )?.[0];

  assert.ok(updateSql);
  assert.match(
    updateSql,
    /daily_items\.is_prepared is distinct from requested_updates\.is_prepared\s*or\s*\(\s*requested_updates\.is_prepared\s*and daily_items\.is_deferred\s*\)/i,
  );

  const sqlChangePredicate = (
    currentPrepared: boolean,
    currentDeferred: boolean,
    requestedPrepared: boolean,
  ) =>
    currentPrepared !== requestedPrepared ||
    (requestedPrepared && currentDeferred);

  assert.equal(sqlChangePredicate(false, false, false), false);
  assert.equal(sqlChangePredicate(true, false, true), false);
  assert.equal(sqlChangePredicate(true, true, true), true);
  assert.equal(sqlChangePredicate(false, true, false), false);
  assert.equal(sqlChangePredicate(false, true, true), true);
});

test("batch preparation item no-op rows are excluded from the sole versioned snapshot update", () => {
  const functionSql = getFunctionSql();
  const updateStatements =
    functionSql.match(
      /update public\.daily_items[\s\S]*?returning daily_items\.id/gi,
    ) ?? [];

  assert.equal(updateStatements.length, 1);
  const updateSql = updateStatements[0];
  assert.match(
    updateSql,
    /and \(\s*daily_items\.is_prepared is distinct from requested_updates\.is_prepared\s*or\s*\(\s*requested_updates\.is_prepared\s*and daily_items\.is_deferred\s*\)\s*\)/i,
  );
  assert.match(updateSql, /version = daily_items\.version \+ 1/i);
  assert.match(updateSql, /updated_by_member_id = current_member_id/i);
  assert.match(updateSql, /updated_by_user_id = current_user_id/i);
  assert.match(
    updateSql,
    /updated_by_display_name = current_member_display_name/i,
  );
  assert.match(updateSql, /updated_at = mutation_at/i);
});

test("batch preparation item returns mergeable changed and unchanged item payloads", () => {
  const functionSql = getFunctionSql();
  const payloadStart = functionSql.indexOf("select coalesce(", functionSql.indexOf("from updated_items;"));
  const payloadEnd = functionSql.lastIndexOf(
    "return pg_catalog.jsonb_build_object(",
  );
  const payloadSql = functionSql.slice(payloadStart, payloadEnd);

  for (const key of [
    "daily_item_id",
    "daily_session_id",
    "family_id",
    "is_prepared",
    "is_deferred",
    "version",
    "updated_by_member_id",
    "updated_by_user_id",
    "updated_by_display_name",
    "updated_at",
    "changed",
  ]) {
    assert.match(functionSql, new RegExp(`'${key}'`, "i"));
  }
  assert.match(
    functionSql,
    /'changed', daily_items\.id = any\(changed_item_ids\)/i,
  );
  assert.match(
    functionSql,
    /'requested_count', requested_count[\s\S]*'changed_count', changed_count[\s\S]*'unchanged_count', requested_count - changed_count[\s\S]*'items', item_payloads/i,
  );
  assert.ok(payloadStart >= 0);
  assert.ok(payloadEnd > payloadStart);
  assert.match(payloadSql, /pg_catalog\.jsonb_agg\(/i);
  assert.match(payloadSql, /order by daily_items\.id/i);
  assert.match(
    payloadSql,
    /join \(\s*select \(update_elements\.value ->> 'daily_item_id'\)::uuid as daily_item_id[\s\S]*on requested_updates\.daily_item_id = daily_items\.id/i,
  );
  assert.doesNotMatch(
    payloadSql,
    /where[\s\S]*daily_items\.id\s*=\s*any\(changed_item_ids\)/i,
  );
});

test("batch preparation item expected versions match the positive version schema contract", () => {
  const functionSql = getFunctionSql();
  const dailyItemVersionDefault = schemaSql.indexOf(
    "alter column version set default 1",
    schemaSql.indexOf("alter table public.daily_items"),
  );
  const dailyItemAlterStart = schemaSql.lastIndexOf(
    "alter table public.daily_items",
    dailyItemVersionDefault,
  );
  const dailyItemAlterEnd = schemaSql.indexOf(";", dailyItemAlterStart);
  const dailyItemAlterSql = schemaSql.slice(
    dailyItemAlterStart,
    dailyItemAlterEnd + 1,
  );
  const countConstraintStart = schemaSql.indexOf(
    "add constraint daily_items_daily_sharing_counts_check",
  );
  const countConstraintEnd = schemaSql.indexOf(
    "not valid;",
    countConstraintStart,
  );
  const countConstraintSql = schemaSql.slice(
    countConstraintStart,
    countConstraintEnd + "not valid;".length,
  );

  assert.ok(dailyItemAlterStart >= 0);
  assert.match(
    dailyItemAlterSql,
    /alter column version set default 1,\s*alter column version set not null/i,
  );
  assert.ok(countConstraintStart >= 0);
  assert.match(countConstraintSql, /and version >= 1/i);
  assert.match(
    schemaSql,
    /alter table public\.daily_items\s+validate constraint daily_items_daily_sharing_counts_check;/i,
  );
  assert.match(
    functionSql,
    /update_elements\.value ->> 'expected_version'\) !~ '\^\[1-9\]\[0-9\]\*\$'/i,
  );
});

test("batch preparation item cannot mutate session state or unrelated item state", () => {
  const functionSql = getFunctionSql();

  assert.doesNotMatch(functionSql, /\binsert\s+into\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(functionSql, /update public\.daily_sessions/i);
  assert.doesNotMatch(
    functionSql,
    /checked_at\s*=|checked_by_\w+\s*=|prepared_at\s*=|prepared_by_\w+\s*=|thanks_\w+\s*=/i,
  );
  assert.doesNotMatch(
    functionSql,
    /is_checked\s*=|rough_state\s*=|is_carryover\s*=|carryover_pending_shortage_count\s*=|carryover_resolved_at\s*=/i,
  );
});

test("batch preparation item has all existing daily mutation status envelopes", () => {
  const functionSql = getFunctionSql();

  for (const status of [
    "success",
    "conflict",
    "invalid_state",
    "forbidden",
    "not_found",
  ]) {
    assert.match(functionSql, new RegExp(`'status', '${status}'`, "i"));
  }
});
