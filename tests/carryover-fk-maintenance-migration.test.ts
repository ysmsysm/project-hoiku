import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName = "20260805000400_fix_carryover_fk_maintenance.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const sharingExpansionSql = readFileSync(
  "supabase/migrations/20260719000100_expand_daily_sharing_schema.sql",
  "utf8",
);
const itemHardeningSql = readFileSync(
  "supabase/migrations/20260805000200_harden_daily_carryover_references.sql",
  "utf8",
);
const sessionHardeningSql = readFileSync(
  "supabase/migrations/20260805000300_harden_daily_session_scope.sql",
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

test("carryover FK maintenance fix migration is unique, ordered, and BOM-free", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrations.includes(migrationName));
  assert.deepEqual(
    migrations.filter((file) => file.startsWith("20260805000400_")),
    [migrationName],
  );
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  const sessionLock = sql.indexOf(
    "lock table public.daily_sessions in share row exclusive mode;",
  );
  const itemLock = sql.indexOf(
    "lock table public.daily_items in share row exclusive mode;",
  );
  const preflight = sql.indexOf("do $$");
  const replacement = sql.indexOf("create or replace function");
  assert.ok(sessionLock >= 0);
  assert.ok(itemLock > sessionLock);
  assert.ok(preflight > itemLock);
  assert.ok(replacement > preflight);
});

test("carryover FK maintenance fix repeats the complete fail-closed preflight", () => {
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

test("final carryover validator removes trigger-depth inference", () => {
  assert.doesNotMatch(functionSql, /pg_trigger_depth/i);
  assert.match(itemHardeningSql, /pg_catalog\.pg_trigger_depth\(\) = 1/i);
});

test("final carryover validator makes daily item identity immutable", () => {
  assert.match(
    functionSql,
    /from previous_rows\s+left join updated_rows\s+on updated_rows\.id = previous_rows\.id\s+where updated_rows\.id is null/i,
  );
  assert.match(
    functionSql,
    /from updated_rows\s+left join previous_rows\s+on previous_rows\.id = updated_rows\.id\s+where previous_rows\.id is null/i,
  );
  assert.match(
    functionSql,
    /raise exception 'invalid_daily_carryover_reference'\s+using errcode = '23514'/i,
  );
});

test("direct unlink is rejected exactly while its physical source still exists", () => {
  assert.match(
    functionSql,
    /previous_rows\.carried_from_daily_item_id is not null[\s\S]*?updated_rows\.carried_from_daily_item_id is null[\s\S]*?from public\.daily_items as unlink_sources[\s\S]*?unlink_sources\.id =\s*previous_rows\.carried_from_daily_item_id[\s\S]*?raise exception 'invalid_daily_carryover_reference'/i,
  );
  assert.doesNotMatch(
    functionSql,
    /unlink_sources\.deleted_at is null|unlink_sources\.deleted_at is not null/i,
  );
});

test("physical source absence permits only the FK-generated null transition", () => {
  const unlinkBlockStart = functionSql.indexOf(
    "previous_rows.carried_from_daily_item_id is not null",
  );
  const unlinkBlockEnd = functionSql.indexOf("end if;", unlinkBlockStart);
  const unlinkBlock = functionSql.slice(unlinkBlockStart, unlinkBlockEnd);
  assert.match(unlinkBlock, /updated_rows\.carried_from_daily_item_id is null/i);
  assert.match(unlinkBlock, /exists \([\s\S]*?from public\.daily_items as unlink_sources/i);
  assert.doesNotMatch(unlinkBlock, /not exists/i);
  assert.match(
    sharingExpansionSql,
    /foreign key \(carried_from_daily_item_id\)[\s\S]*?references public\.daily_items\(id\)[\s\S]*?on delete set null/i,
  );
});

test("final validator preserves both transition-trigger contracts and stable source locks", () => {
  assert.match(functionSql, /if tg_op = 'INSERT'/i);
  assert.match(functionSql, /from inserted_rows as destination_items/i);
  assert.match(functionSql, /if tg_op = 'UPDATE'/i);
  assert.match(functionSql, /from previous_rows/i);
  assert.match(functionSql, /from updated_rows as destination_items/i);
  assert.match(
    functionSql,
    /from public\.daily_items as source_items[\s\S]*?from inserted_rows[\s\S]*?order by source_items\.id\s+for update;/i,
  );
  assert.match(
    functionSql,
    /from public\.daily_items as source_items[\s\S]*?from updated_rows[\s\S]*?order by source_items\.id\s+for update nowait;/i,
  );
});

test("final validator preserves outgoing and inbound global scope validation", () => {
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
  assert.match(
    functionSql,
    /from updated_rows as source_items\s+join public\.daily_items as destination_items\s+on destination_items\.carried_from_daily_item_id = source_items\.id/i,
  );
});

test("final validator retains its locked-down security-definer contract", () => {
  assert.match(
    functionSql,
    /returns trigger\s+language plpgsql\s+security definer\s+set search_path = ''/i,
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
  assert.doesNotMatch(sql, /grant execute on function/i);
});

test("four migrations compose with client DELETE denied and privileged FK maintenance retained", () => {
  assert.match(
    itemHardeningSql,
    /revoke delete on table public\.daily_items from authenticated;/i,
  );
  assert.match(
    sessionHardeningSql,
    /revoke delete on table public\.daily_sessions from authenticated;/i,
  );
  assert.match(
    functionSql,
    /updated_rows\.carried_from_daily_item_id is null[\s\S]*?exists \([\s\S]*?from public\.daily_items as unlink_sources/i,
  );
});

test("FK maintenance fix changes no FK, trigger, table, column, or data", () => {
  assert.doesNotMatch(
    sql,
    /create trigger|drop trigger|alter table|drop (table|column|function)|truncate|delete\s+from|update\s+public|insert\s+into/i,
  );
  assert.doesNotMatch(functionSql, /execute\s+|service_role|private key|secret/i);
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});
