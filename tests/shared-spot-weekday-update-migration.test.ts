import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260717000200_update_shared_spot_item_weekdays.sql";
const sql = readFileSync(migrationPath, "utf8");
const functionSignature =
  "create or replace function public.update_family_spot_item_template_weekdays";

const getFunctionSql = () => {
  const functionStart = sql.indexOf(functionSignature);
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("shared spot weekday update RPC uses invoker RLS and family membership", () => {
  assert.match(
    sql,
    /create or replace function public\.update_family_spot_item_template_weekdays[\s\S]*security invoker/,
  );
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /public\.is_family_member\(p_family_id\)/);
  assert.doesNotMatch(sql, /owner_role|role <> 'owner'/);
  assert.match(
    sql,
    /grant execute on function public\.update_family_spot_item_template_weekdays[\s\S]*to authenticated;/,
  );
  assert.match(sql, /Atomically saves shared spot item edits/);
});

test("shared spot weekday update RPC validates child, spot item, active state, and weekdays", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /children\.id = p_child_id[\s\S]*children\.family_id = p_family_id[\s\S]*for update/,
  );
  assert.match(
    functionSql,
    /item_templates\.id = p_item_template_id[\s\S]*item_templates\.family_id = p_family_id[\s\S]*item_templates\.child_id = p_child_id[\s\S]*item_templates\.kind = 'spot'[\s\S]*item_templates\.is_active = true[\s\S]*for update/,
  );
  assert.match(functionSql, /cardinality\(p_weekdays\) > 7/);
  assert.match(functionSql, /weekday is null or weekday < 0 or weekday > 6/);
  assert.match(functionSql, /duplicate_item_weekday/);
});

test("shared spot weekday update RPC deletes existing weekdays before reinserting atomically", () => {
  const functionSql = getFunctionSql();
  const itemUpdate = functionSql.indexOf("update public.item_templates");
  const weekdayDelete = functionSql.indexOf("delete from public.item_template_weekdays");
  const weekdayInsert = functionSql.indexOf("insert into public.item_template_weekdays");
  const functionEnd = functionSql.indexOf("$$;");

  assert.ok(itemUpdate >= 0);
  assert.ok(weekdayDelete > itemUpdate);
  assert.ok(weekdayInsert > weekdayDelete);
  assert.ok(functionEnd > weekdayInsert);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("shared spot weekday update RPC supports zero weekdays as delete only", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /foreach weekday_value in array p_weekdays/);
  assert.doesNotMatch(functionSql, /cardinality\(p_weekdays\) < 1/);
});
