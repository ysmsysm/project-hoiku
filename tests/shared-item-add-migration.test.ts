import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260718000200_add_family_item_template_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");

const functionSignature =
  "create or replace function public.add_family_item_template";

const getFunctionSql = () => {
  const functionStart = sql.indexOf(functionSignature);
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("shared regular and rough add RPC has the expected signature and security", () => {
  assert.match(
    sql,
    /create or replace function public\.add_family_item_template\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_kind text,\s*p_name text,\s*p_default_quantity integer,\s*p_unit text,\s*p_current_rough_state text default null\s*\)/i,
  );
  assert.match(sql, /returns table \(\s*id uuid,\s*sort_order integer\s*\)/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(
    sql,
    /revoke all on function public\.add_family_item_template\(\s*uuid,\s*uuid,\s*text,\s*text,\s*integer,\s*text,\s*text\s*\) from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.add_family_item_template\(\s*uuid,\s*uuid,\s*text,\s*text,\s*integer,\s*text,\s*text\s*\) from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.add_family_item_template\(\s*uuid,\s*uuid,\s*text,\s*text,\s*integer,\s*text,\s*text\s*\) from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.add_family_item_template\(\s*uuid,\s*uuid,\s*text,\s*text,\s*integer,\s*text,\s*text\s*\) to authenticated;/i,
  );
});

test("shared regular and rough add RPC checks auth, membership, and child ownership", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(functionSql, /if current_user_id is null[\s\S]*not_authenticated/i);
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*not_family_member/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id[\s\S]*for update/i,
  );
  assert.match(functionSql, /if locked_child_id is null[\s\S]*child_not_found/i);
});

test("shared regular and rough add RPC validates kind and input values", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_kind is null or p_kind not in \('regular', 'rough'\)/i);
  assert.match(functionSql, /invalid_item_kind/i);
  assert.match(
    functionSql,
    /trimmed_name := pg_catalog\.btrim\(p_name\)[\s\S]*char_length\(trimmed_name\) < 1[\s\S]*char_length\(trimmed_name\) > 80/i,
  );
  assert.match(
    functionSql,
    /p_default_quantity is null[\s\S]*p_default_quantity < 0[\s\S]*p_default_quantity > 5/i,
  );
  assert.match(
    functionSql,
    /p_unit is null[\s\S]*pg_catalog\.char_length\(p_unit\) > 10/i,
  );
  assert.match(
    functionSql,
    /p_kind = 'regular' and p_current_rough_state is not null/i,
  );
  assert.match(
    functionSql,
    /p_kind = 'rough'[\s\S]*p_current_rough_state is null[\s\S]*p_current_rough_state <> 'enough'/i,
  );
  assert.doesNotMatch(functionSql, /p_kind\s*=\s*'spot'/i);
});

test("shared regular and rough add RPC appends using active item sort order after locking child", () => {
  const functionSql = getFunctionSql();
  const childLockIndex = functionSql.search(/from public\.children/i);
  const maxSortIndex = functionSql.search(/max\(item_templates\.sort_order\)/i);
  const insertIndex = functionSql.search(/insert into public\.item_templates/i);

  assert.ok(childLockIndex >= 0);
  assert.ok(maxSortIndex > childLockIndex);
  assert.ok(insertIndex > maxSortIndex);
  assert.match(
    functionSql,
    /coalesce\(pg_catalog\.max\(item_templates\.sort_order\), -1\) \+ 1/i,
  );
  assert.match(functionSql, /item_templates\.is_active = true/i);
  assert.match(functionSql, /next_sort_order > 100000/i);
});

test("shared regular and rough add RPC inserts one active item and returns id with sort order", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /insert into public\.item_templates as inserted_item/i);
  assert.match(functionSql, /current_rough_state,\s*is_active/i);
  assert.match(functionSql, /p_current_rough_state,\s*true/i);
  assert.match(functionSql, /returning inserted_item\.id into new_item_template_id/i);
  assert.match(functionSql, /id := new_item_template_id/i);
  assert.match(functionSql, /sort_order := next_sort_order/i);
  assert.match(functionSql, /return next/i);
});
