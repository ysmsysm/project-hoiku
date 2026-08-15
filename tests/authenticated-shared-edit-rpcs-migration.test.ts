import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260816000100_repair_authenticated_shared_edit_rpcs.sql",
  "utf8",
);

test("authenticated shared edit RPCs remove invalid qualified coalesce calls", () => {
  assert.match(migration, /update_family_rough_item_state/i);
  assert.match(migration, /'pg_catalog\.coalesce\('/i);
  assert.match(migration, /'coalesce\('/i);
  assert.match(
    migration,
    /'pg_catalog\.coalesce\(pg_catalog\.max\(daily_items\.sort_order\), -1\)'/i,
  );
  assert.match(
    migration,
    /'coalesce\(pg_catalog\.max\(daily_items\.sort_order\), -1\)'/i,
  );
});

test("daily spot writer runs as the locked authenticated RPC contract", () => {
  assert.match(
    migration,
    /alter function public\.mutate_daily_spot_item\([\s\S]*owner to postgres/i,
  );
  assert.match(
    migration,
    /alter function public\.mutate_daily_spot_item\([\s\S]*security definer/i,
  );
  assert.match(migration, /set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.mutate_daily_spot_item\([\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.mutate_daily_spot_item\([\s\S]*to authenticated/i,
  );
});

test("repair migration changes no table data or completed-action guards", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update\s+public|delete\s+from|alter\s+table|create\s+table|drop\s+)\b/i,
  );
  assert.doesNotMatch(migration, /p_action\s+not\s+in|session_prepared/i);
});
