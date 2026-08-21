import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260822000100_fix_shared_item_template_update_coalesce.sql";
const migration = readFileSync(migrationPath, "utf8");

test("shared item template update repair targets the exact existing RPC", () => {
  assert.match(
    migration,
    /public\.update_family_item_template\(uuid,uuid,uuid,timestamptz,text,integer,text\)/i,
  );
  assert.match(migration, /pg_catalog\.pg_get_functiondef/i);
  assert.match(migration, /'pg_catalog\.coalesce\('/i);
  assert.match(migration, /'coalesce\('/i);
  assert.match(
    migration,
    /item_template_update_coalesce_call_not_found/i,
  );
});

test("shared item template update repair changes only the function definition", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update\s+public|delete\s+from|alter\s+table|create\s+table|drop\s+)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /update_family_(?:rough_item_state|spot_item_template)/i,
  );
  assert.equal(migration.charCodeAt(0) === 0xfeff, false);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/i);
});
