import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260815000500_fix_daily_spot_prepared_lookup.sql",
  "utf8",
);

test("daily spot runtime lookup derives completion from prepared_at", () => {
  assert.match(
    migration,
    /pg_get_functiondef\([\s\S]*public\.mutate_daily_spot_item\(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date\)/i,
  );
  assert.match(
    migration,
    /pg_catalog\.replace\([\s\S]*'daily_sessions\.id, daily_sessions\.is_prepared'[\s\S]*'daily_sessions\.id, daily_sessions\.prepared_at is not null'/i,
  );
  assert.match(migration, /execute patched_definition/i);
  assert.match(migration, /daily_spot_prepared_lookup_not_found/i);
});

test("daily spot lookup repair changes no table data or completed-action guard", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from|alter\s+table|create\s+table|drop\s+)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /p_action\s+not\s+in|add_template|add_temporary|set_due_date|carryover/i,
  );
});
