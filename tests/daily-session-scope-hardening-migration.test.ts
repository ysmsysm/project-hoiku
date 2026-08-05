import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName = "20260805000300_harden_daily_session_scope.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");
const baseSchemaSql = readFileSync(
  "supabase/migrations/20260711000100_create_family_sharing_schema.sql",
  "utf8",
);
const sharingExpansionSql = readFileSync(
  "supabase/migrations/20260719000100_expand_daily_sharing_schema.sql",
  "utf8",
);
const atomicDeleteSql = readFileSync(
  "supabase/migrations/20260805000100_add_atomic_shared_item_delete_rpc.sql",
  "utf8",
);
const carryoverHardeningSql = readFileSync(
  "supabase/migrations/20260805000200_harden_daily_carryover_references.sql",
  "utf8",
);
const fkMaintenanceFixSql = readFileSync(
  "supabase/migrations/20260805000400_fix_carryover_fk_maintenance.sql",
  "utf8",
);
const completeCheckSql = readFileSync(
  "supabase/migrations/20260719000500_add_complete_daily_check_rpc.sql",
  "utf8",
);
const completePreparationSql = readFileSync(
  "supabase/migrations/20260726000100_add_complete_daily_preparation_rpc.sql",
  "utf8",
);
const thanksSql = readFileSync(
  "supabase/migrations/20260803000100_add_send_daily_thanks_rpc.sql",
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
  "enforce_daily_session_scope_immutability",
);
const preflightSql = sql.slice(0, sql.indexOf("create or replace function"));

const getDailySessionUpdateSet = (source: string, functionName: string) => {
  const rpcSql = extractFunctionSql(source, functionName);
  const updateStart = rpcSql.indexOf("update public.daily_sessions");
  assert.ok(updateStart >= 0);
  const updateEnd = rpcSql.indexOf(";", updateStart);
  assert.ok(updateEnd > updateStart);
  const updateSql = rpcSql.slice(updateStart, updateEnd + 1);
  const setStart = updateSql.search(/\bset\s/i);
  const setEnd = updateSql.search(/\swhere\s/i);
  assert.ok(setStart >= 0);
  assert.ok(setEnd > setStart);
  return updateSql.slice(setStart, setEnd);
};

test("daily session scope hardening migration is uniquely ordered and BOM-free", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );
  assert.ok(migrations.includes(migrationName));
  assert.deepEqual(
    migrations.filter((file) => file.startsWith("20260805000300_")),
    [migrationName],
  );
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
});

test("daily session hardening locks sessions then items before a complete global preflight", () => {
  const sessionLock = sql.indexOf(
    "lock table public.daily_sessions in share row exclusive mode;",
  );
  const itemLock = sql.indexOf(
    "lock table public.daily_items in share row exclusive mode;",
  );
  const preflight = sql.indexOf("do $$");
  const functionDefinition = sql.indexOf("create or replace function");
  assert.ok(sessionLock >= 0);
  assert.ok(itemLock > sessionLock);
  assert.ok(preflight > itemLock);
  assert.ok(functionDefinition > preflight);
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

test("daily session scope trigger is a minimal invoker BEFORE UPDATE row trigger", () => {
  assert.match(
    functionSql,
    /returns trigger\s+language plpgsql\s+security invoker\s+set search_path = ''/i,
  );
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.match(
    sql,
    /create trigger daily_sessions_enforce_scope_immutability\s+before update on public\.daily_sessions\s+for each row\s+execute function public\.enforce_daily_session_scope_immutability\(\);/i,
  );
  assert.doesNotMatch(sql, /before update of/i);
  assert.match(functionSql, /return new;/i);
});

test("daily session scope trigger rejects every identity or scope change and permits equal values", () => {
  for (const column of ["id", "family_id", "child_id", "session_date"]) {
    assert.match(
      functionSql,
      new RegExp(`new\\.${column} is distinct from old\\.${column}`, "i"),
    );
  }
  assert.equal(
    [...functionSql.matchAll(/new\.([a-z_]+) is distinct from old\.\1/gi)].map(
      (match) => match[1],
    ).sort().join(","),
    "child_id,family_id,id,session_date",
  );
  assert.match(
    functionSql,
    /raise exception 'immutable_daily_session_scope'\s+using errcode = '23514'/i,
  );
});

test("daily session scope trigger function is not directly executable by client roles", () => {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.enforce_daily_session_scope_immutability\\(\\)\\s+from ${role};`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.enforce_daily_session_scope_immutability/i,
  );
});

test("daily session physical DELETE is revoked from every client role without removing INSERT or UPDATE", () => {
  assert.match(
    baseSchemaSql,
    /grant select, insert, update, delete on public\.daily_sessions to authenticated;/i,
  );
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke delete on table public\\.daily_sessions from ${role};`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /revoke (insert|update) on table public\.daily_sessions/i,
  );
  assert.doesNotMatch(sql, /grant (?:[a-z, ]*delete|delete)/i);
});

test("daily session hardening preserves FK definitions and composes with the final maintenance gate", () => {
  assert.match(
    baseSchemaSql,
    /constraint daily_items_session_family_fk[\s\S]*?references public\.daily_sessions\(id, family_id\)[\s\S]*?on delete cascade/i,
  );
  assert.match(
    sharingExpansionSql,
    /constraint daily_items_carried_from_daily_item_fk[\s\S]*?references public\.daily_items\(id\)[\s\S]*?on delete set null/i,
  );
  assert.doesNotMatch(
    sql,
    /alter table[\s\S]*?(drop constraint|add constraint)|drop (table|column|function|trigger)|truncate/i,
  );
  const finalFunctionSql = extractFunctionSql(
    fkMaintenanceFixSql,
    "validate_daily_carryover_references",
  );
  assert.doesNotMatch(finalFunctionSql, /pg_trigger_depth/i);
  assert.match(
    finalFunctionSql,
    /updated_rows\.carried_from_daily_item_id is null[\s\S]*?from public\.daily_items as unlink_sources/i,
  );
});

test("security-invoker session RPCs mutate only allowed state fields", () => {
  const rpcUpdates = [
    {
      source: completeCheckSql,
      name: "complete_daily_check",
      required: ["checked_at", "checked_by_member_id", "version"],
    },
    {
      source: completePreparationSql,
      name: "complete_daily_preparation",
      required: ["prepared_at", "prepared_by_member_id", "version"],
    },
    {
      source: thanksSql,
      name: "send_daily_thanks",
      required: ["thanks_sent_at", "thanks_sent_by_member_id", "version"],
    },
  ];
  for (const rpc of rpcUpdates) {
    const rpcSql = extractFunctionSql(rpc.source, rpc.name);
    const setSql = getDailySessionUpdateSet(rpc.source, rpc.name);
    assert.match(rpcSql, /security invoker/i);
    for (const column of rpc.required) {
      assert.match(setSql, new RegExp(`\\b${column}\\s*=`, "i"));
    }
    assert.doesNotMatch(setSql, /\b(id|family_id|child_id|session_date)\s*=/i);
  }

  const ensureSql = extractFunctionSql(atomicDeleteSql, "ensure_daily_session");
  assert.match(ensureSql, /security invoker/i);
  assert.match(ensureSql, /insert into public\.daily_sessions/i);
  assert.doesNotMatch(ensureSql, /update public\.daily_sessions|delete from public\.daily_sessions/i);
});

test("four hardening migrations compose into item, reference, parent-scope, and FK maintenance protection", () => {
  assert.match(
    atomicDeleteSql,
    /function public\.delete_family_item_template_for_day/i,
  );
  assert.match(
    carryoverHardeningSql,
    /create trigger daily_items_validate_carryover_references_insert[\s\S]*?create trigger daily_items_validate_carryover_references_update/i,
  );
  assert.match(
    carryoverHardeningSql,
    /from updated_rows as source_items\s+join public\.daily_items as destination_items\s+on destination_items\.carried_from_daily_item_id = source_items\.id/i,
  );
  assert.match(
    carryoverHardeningSql,
    /revoke delete on table public\.daily_items from authenticated;/i,
  );
  assert.match(
    sql,
    /before update on public\.daily_sessions[\s\S]*?revoke delete on table public\.daily_sessions from authenticated;/i,
  );
  assert.match(
    fkMaintenanceFixSql,
    /create or replace function public\.validate_daily_carryover_references\(\)[\s\S]*?unlink_sources\.id =\s*previous_rows\.carried_from_daily_item_id/i,
  );
});

test("daily session hardening contains no data mutation, dynamic SQL, secret, or real UUID", () => {
  assert.doesNotMatch(functionSql, /update\s+public|insert\s+into|delete\s+from|execute\s+/i);
  assert.doesNotMatch(sql, /service_role|private key|secret|pg_notify|http|net\./i);
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});
