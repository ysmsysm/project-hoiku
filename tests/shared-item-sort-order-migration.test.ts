import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260718000100_add_shared_item_template_sort_order_rpc.sql";
const sql = readFileSync(migrationPath, "utf8");
const functionSignature =
  "create or replace function public.update_family_item_template_sort_orders";

const getFunctionSql = () => {
  const functionStart = sql.indexOf(functionSignature);
  assert.ok(functionStart >= 0);

  const functionEnd = sql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sql.slice(functionStart, functionEnd + 3);
};

test("shared item sort order RPC uses invoker RLS and family membership", () => {
  assert.match(
    sql,
    /create or replace function public\.update_family_item_template_sort_orders[\s\S]*security invoker/,
  );
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /public\.is_family_member\(p_family_id\)/);
  assert.doesNotMatch(sql, /owner_role|role <> 'owner'/);
  assert.match(
    sql,
    /grant execute on function public\.update_family_item_template_sort_orders[\s\S]*to authenticated;/,
  );
});

test("shared item sort order RPC validates payload, child, active items, and set equality", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /jsonb_typeof\(p_items\) <> 'array'/);
  assert.match(functionSql, /jsonb_array_length\(p_items\)/);
  assert.match(functionSql, /input_item_count > 200/);
  assert.match(functionSql, /invalid_item_template_id/);
  assert.match(functionSql, /duplicate_item_template_id/);
  assert.match(functionSql, /invalid_item_template_sort_order/);
  assert.match(functionSql, /duplicate_item_template_sort_order/);
  assert.match(functionSql, /invalid_item_template_sort_order_sequence/);
  assert.match(functionSql, /generate_series\(0, input_item_count - 1\)/);
  assert.match(
    functionSql,
    /children\.id = p_child_id[\s\S]*children\.family_id = p_family_id[\s\S]*for update/,
  );
  assert.match(
    functionSql,
    /item_templates\.family_id = p_family_id[\s\S]*item_templates\.child_id = p_child_id[\s\S]*item_templates\.is_active = true[\s\S]*for update/,
  );
  assert.match(functionSql, /input_item_count <> active_item_count/);
  assert.match(functionSql, /item_template_sort_order_set_mismatch/);
});

test("shared item sort order RPC only updates sort_order and updated_at", () => {
  const functionSql = getFunctionSql();
  const updateStart = functionSql.indexOf("update public.item_templates");
  assert.ok(updateStart >= 0);
  const updateSql = functionSql.slice(updateStart, functionSql.indexOf(";", updateStart));

  assert.match(updateSql, /sort_order = sort_orders\[item_index\]/);
  assert.match(updateSql, /updated_at = now\(\)/);
  assert.doesNotMatch(updateSql, /name|default_quantity|weekday|item_template_weekdays|kind|current_rough_state/);
});
