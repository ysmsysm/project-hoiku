import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260716000100_add_shared_spot_item_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");
const repairMigrationPath =
  "supabase/migrations/20260716000200_fix_shared_spot_item_rpc_coalesce.sql";
const repairSql = readFileSync(repairMigrationPath, "utf8");
const sevenWeekdaysMigrationPath =
  "supabase/migrations/20260717000100_allow_seven_shared_spot_weekdays.sql";
const sevenWeekdaysSql = readFileSync(sevenWeekdaysMigrationPath, "utf8");

const spotFunctionSignature =
  "create or replace function public.add_family_spot_item_template";
const startFunctionSignature =
  "create or replace function public.start_family_data_sharing";

const getSpotFunctionSql = (migrationSql: string) => {
  const functionStart = migrationSql.indexOf(spotFunctionSignature);
  assert.ok(functionStart >= 0);

  const functionEnd = migrationSql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return migrationSql.slice(functionStart, functionEnd + 3);
};

const getStartFunctionSql = (migrationSql: string) => {
  const functionStart = migrationSql.indexOf(startFunctionSignature);
  assert.ok(functionStart >= 0);

  const functionEnd = migrationSql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return migrationSql.slice(functionStart, functionEnd + 3);
};

test("shared spot RPC uses invoker RLS and checks membership and child ownership", () => {
  assert.match(
    sql,
    /create or replace function public\.add_family_spot_item_template[\s\S]*security invoker/,
  );
  assert.match(sql, /public\.is_family_member\(p_family_id\)/);
  assert.match(
    sql,
    /children\.id = p_child_id[\s\S]*children\.family_id = p_family_id[\s\S]*for update/,
  );
  assert.match(
    sql,
    /grant execute on function public\.add_family_spot_item_template[\s\S]*to authenticated/,
  );
});

test("shared spot RPC validates quantity and up to seven weekdays before atomic inserts", () => {
  assert.match(
    sevenWeekdaysSql,
    /p_default_quantity < 0[\s\S]*p_default_quantity > 5/,
  );
  assert.match(sevenWeekdaysSql, /cardinality\(p_weekdays\) > 7/);
  assert.match(sevenWeekdaysSql, /weekday < 0 or weekday > 6/);
  assert.match(sevenWeekdaysSql, /duplicate_item_weekday/);

  const functionStart = sevenWeekdaysSql.indexOf(
    "create or replace function public.add_family_spot_item_template",
  );
  const templateInsert = sevenWeekdaysSql.indexOf(
    "insert into public.item_templates",
    functionStart,
  );
  const weekdayInsert = sevenWeekdaysSql.indexOf(
    "insert into public.item_template_weekdays",
    templateInsert,
  );
  const functionEnd = sevenWeekdaysSql.indexOf("$$;", functionStart);

  assert.ok(functionStart >= 0);
  assert.ok(templateInsert > functionStart);
  assert.ok(weekdayInsert > templateInsert);
  assert.ok(functionEnd > weekdayInsert);
  assert.doesNotMatch(
    sevenWeekdaysSql.slice(functionStart, functionEnd),
    /exception\s+when|is_active\s*=\s*false|delete from public\.item_templates/i,
  );
});

test("migration aligns sharing-start spot quantities and weekdays", () => {
  const startFunction = getStartFunctionSql(sevenWeekdaysSql);
  assert.match(
    startFunction,
    /if item_kind = 'spot'[\s\S]*item_default_quantity < 0 or item_default_quantity > 5/,
  );
  assert.match(startFunction, /jsonb_array_length\(weekdays_payload\) > 7/);
  assert.doesNotMatch(
    startFunction,
    /item_default_quantity < 1 or item_default_quantity > 99/,
  );
});

test("shared spot RPC uses unqualified SQL coalesce syntax", () => {
  for (const migrationSql of [sql, repairSql, sevenWeekdaysSql]) {
    const spotFunctionSql = getSpotFunctionSql(migrationSql);

    assert.doesNotMatch(spotFunctionSql, /pg_catalog\.coalesce\s*\(/i);
    assert.match(
      spotFunctionSql,
      /select coalesce\(pg_catalog\.max\(item_templates\.sort_order\), -1\) \+ 1/i,
    );
  }
});

test("seven-weekday migration replaces both RPCs without final two-weekday limits", () => {
  assert.equal(
    sevenWeekdaysSql.match(/create or replace function/gi)?.length,
    2,
  );
  assert.doesNotMatch(
    sevenWeekdaysSql,
    /jsonb_array_length\(weekdays_payload\) > 2|cardinality\(p_weekdays\) > 2/,
  );
  assert.match(
    getStartFunctionSql(sevenWeekdaysSql),
    /jsonb_array_length\(weekdays_payload\) > 7/,
  );
  assert.match(
    getSpotFunctionSql(sevenWeekdaysSql),
    /cardinality\(p_weekdays\) > 7/,
  );
});

test("repair migration safely replaces the shared spot RPC", () => {
  assert.equal(repairSql.match(/create or replace function/gi)?.length, 1);
  assert.doesNotMatch(repairSql, /start_family_data_sharing/i);
  assert.match(
    repairSql,
    /create or replace function public\.add_family_spot_item_template\([\s\S]*security invoker[\s\S]*set search_path = ''/i,
  );
  assert.match(
    repairSql,
    /revoke all on function public\.add_family_spot_item_template\(\s*uuid,\s*uuid,\s*text,\s*integer,\s*smallint\[\]\s*\) from public;/i,
  );
  assert.match(
    repairSql,
    /revoke all on function public\.add_family_spot_item_template\(\s*uuid,\s*uuid,\s*text,\s*integer,\s*smallint\[\]\s*\) from anon;/i,
  );
  assert.match(
    repairSql,
    /revoke all on function public\.add_family_spot_item_template\(\s*uuid,\s*uuid,\s*text,\s*integer,\s*smallint\[\]\s*\) from authenticated;/i,
  );
  assert.match(
    repairSql,
    /grant execute on function public\.add_family_spot_item_template\(\s*uuid,\s*uuid,\s*text,\s*integer,\s*smallint\[\]\s*\) to authenticated;/i,
  );
});
