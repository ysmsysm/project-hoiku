import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName =
  "20260805000200_harden_daily_carryover_references.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const baseSchemaSql = readFileSync(
  "supabase/migrations/20260711000100_create_family_sharing_schema.sql",
  "utf8",
);
const carryoverSql = readFileSync(
  "supabase/migrations/20260726000200_fix_daily_carryover_completion_safety.sql",
  "utf8",
);
const deleteSql = readFileSync(
  "supabase/migrations/20260805000100_add_atomic_shared_item_delete_rpc.sql",
  "utf8",
);
const sessionHardeningSql = readFileSync(
  "supabase/migrations/20260805000300_harden_daily_session_scope.sql",
  "utf8",
);
const fkMaintenanceFixSql = readFileSync(
  "supabase/migrations/20260805000400_fix_carryover_fk_maintenance.sql",
  "utf8",
);

const extractFunctionSql = (source: string, functionName: string) => {
  const start = source.indexOf(
    `create or replace function public.${functionName}`,
  );
  assert.ok(start >= 0);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
};

const functionSql = extractFunctionSql(
  sql,
  "validate_daily_carryover_references",
);
const preflightSql = sql.slice(0, sql.indexOf("create or replace function"));

test("carryover hardening migration is uniquely ordered, BOM-free, and locks writes before preflight", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrations.includes(migrationName));
  assert.deepEqual(
    migrations.filter((file) => file.startsWith("20260805000200_")),
    [migrationName],
  );
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  const tableLock = sql.indexOf(
    "lock table public.daily_items in share row exclusive mode;",
  );
  const preflight = sql.indexOf("do $$");
  const functionDefinition = sql.indexOf("create or replace function");
  const insertTrigger = sql.indexOf(
    "create trigger daily_items_validate_carryover_references_insert",
  );
  assert.ok(tableLock >= 0);
  assert.ok(preflight > tableLock);
  assert.ok(functionDefinition > preflight);
  assert.ok(insertTrigger > functionDefinition);
});

test("carryover hardening preflight fails closed on every existing invalid reference shape", () => {
  assert.match(
    preflightSql,
    /from public\.daily_items as destination_items\s+left join public\.daily_items as source_items\s+on source_items\.id = destination_items\.carried_from_daily_item_id/i,
  );
  for (const guard of [
    /source_items\.id is null/i,
    /destination_items\.id = source_items\.id/i,
    /destination_items\.deleted_at is not null/i,
    /source_items\.deleted_at is not null/i,
    /destination_items\.family_id is distinct from source_items\.family_id/i,
    /destination_sessions\.id is null/i,
    /source_sessions\.id is null/i,
    /destination_sessions\.child_id is distinct from source_sessions\.child_id/i,
    /source_sessions\.session_date >= destination_sessions\.session_date/i,
  ]) {
    assert.match(preflightSql, guard);
  }
  assert.match(
    preflightSql,
    /raise exception 'existing_invalid_daily_carryover_reference'\s+using errcode = '23514'/i,
  );
  assert.doesNotMatch(preflightSql, /update\s+public|delete\s+from|insert\s+into/i);
});

test("carryover validation trigger function is a locked-down postgres-owned security definer", () => {
  assert.match(
    functionSql,
    /create or replace function public\.validate_daily_carryover_references\(\s*\)\s*returns trigger\s*language plpgsql\s*security definer\s*set search_path = ''/i,
  );
  assert.match(
    sql,
    /alter function public\.validate_daily_carryover_references\(\)\s+owner to postgres;/i,
  );
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.validate_daily_carryover_references\\(\\)\\s+from ${role};`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(sql, /grant execute on function public\.validate_daily_carryover_references/i);
});

test("carryover validation fires after every INSERT and UPDATE with statement transition tables", () => {
  assert.match(
    sql,
    /create trigger daily_items_validate_carryover_references_insert\s+after insert on public\.daily_items\s+referencing new table as inserted_rows\s+for each statement\s+execute function public\.validate_daily_carryover_references\(\);/i,
  );
  assert.match(
    sql,
    /create trigger daily_items_validate_carryover_references_update\s+after update on public\.daily_items\s+referencing old table as previous_rows new table as updated_rows\s+for each statement\s+execute function public\.validate_daily_carryover_references\(\);/i,
  );
  assert.doesNotMatch(
    sql,
    /after update of carried_from_daily_item_id/i,
  );
});

test("carryover validation locks all INSERT and UPDATE sources globally in UUID order", () => {
  const insertLock = functionSql.match(
    /perform source_items\.id\s+from public\.daily_items as source_items\s+where source_items\.id in \([^;]*?from inserted_rows[^;]*?\)\s+order by source_items\.id\s+for update;/i,
  );
  const updateLock = functionSql.match(
    /perform source_items\.id\s+from public\.daily_items as source_items\s+where source_items\.id in \([^;]*?from updated_rows[^;]*?\)\s+order by source_items\.id\s+for update nowait;/i,
  );
  assert.ok(insertLock);
  assert.ok(updateLock);
  assert.doesNotMatch(insertLock[0], /family_id|child_id/);
  assert.doesNotMatch(updateLock[0], /family_id|child_id/);
  assert.match(
    functionSql,
    /exception\s+when lock_not_available then[\s\S]*?raise exception 'invalid_daily_carryover_reference'\s+using errcode = '23514'/i,
  );
});

test("carryover validation checks complete outgoing scope after each source lock", () => {
  const insertLock = functionSql.indexOf("from inserted_rows");
  const insertValidation = functionSql.indexOf(
    "from inserted_rows as destination_items",
  );
  const updateLock = functionSql.indexOf("from updated_rows");
  const updateValidation = functionSql.indexOf(
    "from updated_rows as destination_items",
  );
  assert.ok(insertLock >= 0);
  assert.ok(insertValidation > insertLock);
  assert.ok(updateLock > insertValidation);
  assert.ok(updateValidation > updateLock);
  for (const guard of [
    "source_items.id is null",
    "destination_items.id = source_items.id",
    "destination_items.deleted_at is not null",
    "source_items.deleted_at is not null",
    "destination_items.family_id is distinct from source_items.family_id",
    "destination_sessions.child_id is distinct from source_sessions.child_id",
    "source_sessions.session_date >= destination_sessions.session_date",
  ]) {
    assert.ok(functionSql.split(guard).length - 1 >= 2);
  }
});

test("carryover validation permits forward chains while making cycles impossible by date order", () => {
  assert.equal(
    functionSql.split(
      "source_sessions.session_date >= destination_sessions.session_date",
    ).length - 1,
    3,
  );
  assert.doesNotMatch(functionSql, /source_items\.carried_from_daily_item_id is null/i);
});

test("the final carryover validator supersedes trigger-depth unlink inference", () => {
  const finalFunctionSql = extractFunctionSql(
    fkMaintenanceFixSql,
    "validate_daily_carryover_references",
  );
  assert.doesNotMatch(finalFunctionSql, /pg_trigger_depth/i);
  assert.match(
    finalFunctionSql,
    /previous_rows\.carried_from_daily_item_id is not null[\s\S]*?updated_rows\.carried_from_daily_item_id is null[\s\S]*?from public\.daily_items as unlink_sources[\s\S]*?unlink_sources\.id =\s*previous_rows\.carried_from_daily_item_id/i,
  );
});

test("carryover validation distinguishes every carried-from UPDATE transition", () => {
  assert.match(
    functionSql,
    /previous_rows\.carried_from_daily_item_id is not null[\s\S]*?updated_rows\.carried_from_daily_item_id is null[\s\S]*?raise exception 'invalid_daily_carryover_reference'/i,
  );
  assert.match(
    functionSql,
    /select updated_rows\.carried_from_daily_item_id\s+from updated_rows\s+where updated_rows\.carried_from_daily_item_id is not null/i,
  );
  assert.doesNotMatch(
    functionSql,
    /where updated_rows\.carried_from_daily_item_id is distinct from previous_rows\.carried_from_daily_item_id/i,
  );
});

test("carryover validation rechecks every inbound reference when a source row changes", () => {
  assert.match(
    functionSql,
    /from updated_rows as source_items\s+join public\.daily_items as destination_items\s+on destination_items\.carried_from_daily_item_id = source_items\.id/i,
  );
  assert.match(
    functionSql,
    /where source_items\.deleted_at is not null[\s\S]*?destination_items\.deleted_at is not null[\s\S]*?destination_items\.family_id is distinct from source_items\.family_id[\s\S]*?destination_sessions\.child_id is distinct from source_sessions\.child_id[\s\S]*?source_sessions\.session_date >= destination_sessions\.session_date/i,
  );
});

test("carryover hardening preserves invoker writers but removes direct physical daily item deletion", () => {
  assert.match(
    baseSchemaSql,
    /grant select, insert, update, delete on public\.daily_items to authenticated;/i,
  );
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke delete on table public\\.daily_items from ${role};`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /revoke (insert|update) on table public\.daily_items from authenticated/i,
  );
  assert.match(carryoverSql, /security invoker/i);
  assert.match(carryoverSql, /update public\.daily_items/i);
  assert.match(carryoverSql, /insert into public\.daily_items/i);
});

test("process_daily_carryovers already owns each source lock before trigger-validated reference writes", () => {
  const sourceLock = carryoverSql.search(
    /from public\.daily_items as source_items[\s\S]*?order by source_sessions\.session_date, source_items\.id\s+for update of source_items skip locked;/i,
  );
  const firstReferenceWrite = carryoverSql.search(
    /carried_from_daily_item_id\s*=/i,
  );
  const insertReferenceWrite = carryoverSql.search(
    /insert into public\.daily_items[\s\S]*?carried_from_daily_item_id/i,
  );
  assert.ok(sourceLock >= 0);
  assert.ok(firstReferenceWrite > sourceLock);
  assert.ok(insertReferenceWrite > sourceLock);
});

test("delete RPC and carryover trigger compose into a two-way source-row race barrier", () => {
  const deleteFunctionSql = extractFunctionSql(
    deleteSql,
    "delete_family_item_template_for_day",
  );
  const deleteSourceLock = deleteFunctionSql.search(
    /perform daily_items\.id[\s\S]*?order by daily_items\.id\s*for update;/i,
  );
  const deleteReferenceGuard = deleteFunctionSql.search(
    /referring_items\.carried_from_daily_item_id = target_daily_item_id/i,
  );
  const deleteUpdate = deleteFunctionSql.indexOf("update public.daily_items");
  assert.ok(deleteSourceLock >= 0);
  assert.ok(deleteReferenceGuard > deleteSourceLock);
  assert.ok(deleteUpdate > deleteReferenceGuard);
  assert.match(
    functionSql,
    /order by source_items\.id\s+for update(?: nowait)?;[\s\S]*?source_items\.deleted_at is not null/i,
  );
  assert.match(
    functionSql,
    /join public\.daily_items as destination_items\s+on destination_items\.carried_from_daily_item_id = source_items\.id[\s\S]*?source_items\.deleted_at is not null/i,
  );
});

test("carryover validation exposes only generic constraint errors and performs no data mutation", () => {
  assert.match(
    functionSql,
    /raise exception 'invalid_daily_carryover_reference'\s+using errcode = '23514'/i,
  );
  assert.doesNotMatch(functionSql, /raise exception[^\n]*%/i);
  assert.doesNotMatch(
    functionSql,
    /update\s+public|insert\s+into|delete\s+from|execute\s+/i,
  );
});

test("carryover hardening adds no destructive schema operation, physical delete, secret, or real UUID", () => {
  assert.doesNotMatch(
    sql,
    /alter table[\s\S]*add column|drop (table|column|function|trigger)|truncate/i,
  );
  assert.doesNotMatch(sql, /delete\s+from\s+public\.daily_items/i);
  assert.doesNotMatch(
    sql,
    /service_role|private key|secret|pg_notify|http|net\./i,
  );
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});

test("carryover reference hardening composes with immutable, non-deletable daily session scope", () => {
  assert.match(
    sessionHardeningSql,
    /new\.id is distinct from old\.id[\s\S]*?new\.family_id is distinct from old\.family_id[\s\S]*?new\.child_id is distinct from old\.child_id[\s\S]*?new\.session_date is distinct from old\.session_date/i,
  );
  assert.match(
    sessionHardeningSql,
    /create trigger daily_sessions_enforce_scope_immutability\s+before update on public\.daily_sessions/i,
  );
  assert.match(
    sessionHardeningSql,
    /revoke delete on table public\.daily_sessions from authenticated;/i,
  );
  assert.match(
    sessionHardeningSql,
    /lock table public\.daily_sessions in share row exclusive mode;\s+lock table public\.daily_items in share row exclusive mode;/i,
  );
  assert.doesNotMatch(fkMaintenanceFixSql, /pg_trigger_depth/i);
  assert.match(
    fkMaintenanceFixSql,
    /create or replace function public\.validate_daily_carryover_references\(\)/i,
  );
});
