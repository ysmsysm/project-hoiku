import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000700_add_process_daily_carryovers_rpc.sql";
const fixMigrationPath =
  "supabase/migrations/20260724000100_fix_process_daily_carryovers_rpc_qualification.sql";
const migrationBytes = readFileSync(migrationPath);
const fixMigrationBytes = readFileSync(fixMigrationPath);
const sql = migrationBytes.toString("utf8");
const fixSql = fixMigrationBytes.toString("utf8");
const expectedFirstLine =
  "create or replace function public.process_daily_carryovers(";

const getFunctionSql = (sourceSql = sql) => {
  const functionStart = sourceSql.indexOf(
    "create or replace function public.process_daily_carryovers",
  );
  assert.ok(functionStart >= 0);

  const functionEnd = sourceSql.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return sourceSql.slice(functionStart, functionEnd + 3);
};

const getClaimInsertSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /insert into pg_temp\.claimed_daily_carryovers[\s\S]*?for update of source_items skip locked;/i,
  );

  assert.ok(match);
  return match[0];
};

const getUpdateStatements = () => {
  const functionSql = getFunctionSql();
  return (
    functionSql.match(
      /update public\.daily_items as destination_items[\s\S]*?returning destination_items\.item_template_id/gi,
    ) ?? []
  );
};

const getAdHocInsertSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /insert into public\.daily_items[\s\S]*?returning daily_items\.carried_from_daily_item_id as source_id/i,
  );

  assert.ok(match);
  return match[0];
};

const getProcessedSetSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /create temporary table pg_temp\.processable_daily_carryover_sources[\s\S]*?with processed_sources as/i,
  );

  assert.ok(match);
  return match[0];
};

const getSourceProcessedSql = () => {
  const functionSql = getFunctionSql();
  const match = functionSql.match(
    /update public\.daily_items as source_items[\s\S]*?returning source_items\.id/i,
  );

  assert.ok(match);
  return match[0];
};

test("daily carryovers process RPC uses fully-qualified pg_temp carryover tables", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /create temporary table pg_temp\.claimed_daily_carryovers/i,
  );
  assert.match(
    functionSql,
    /create temporary table pg_temp\.processable_daily_carryover_sources/i,
  );
  assert.match(
    functionSql,
    /create temporary table pg_temp\.inserted_ad_hoc_daily_carryovers/i,
  );
  assert.doesNotMatch(
    functionSql,
    /(?:from|join|into|table|exists|update)\s+(?!pg_temp\.)(?:claimed_daily_carryovers|processable_daily_carryover_sources|inserted_ad_hoc_daily_carryovers)\b/i,
  );
});

test("daily carryovers process RPC migration is present with expected signature and security", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(
    migrations.includes(
      "20260719000700_add_process_daily_carryovers_rpc.sql",
    ),
  );
  assert.ok(
    migrations.includes(
      "20260724000100_fix_process_daily_carryovers_rpc_qualification.sql",
    ),
  );
  assert.match(
    sql,
    /create or replace function public\.process_daily_carryovers\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_to_session_date date\s*\)/i,
  );
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
});

test("daily carryovers process RPC migrations are saved without UTF-8 BOM", () => {
  for (const [path, bytes] of [
    [migrationPath, migrationBytes],
    [fixMigrationPath, fixMigrationBytes],
  ] as const) {
    assert.notDeepEqual(
      [...bytes.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
      `${path} must not start with UTF-8 BOM`,
    );
    assert.equal(bytes[0], "c".charCodeAt(0));
    assert.ok(bytes.toString("utf8").startsWith(expectedFirstLine));
  }
});

test("daily carryovers process RPC fix migration redefines the same secured function", () => {
  assert.match(
    fixSql,
    /create or replace function public\.process_daily_carryovers\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_to_session_date date\s*\)/i,
  );
  assert.match(fixSql, /returns jsonb/i);
  assert.match(fixSql, /security invoker/i);
  assert.match(fixSql, /set search_path = ''/i);
  assert.match(
    fixSql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from public;/i,
  );
  assert.match(
    fixSql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from anon;/i,
  );
  assert.match(
    fixSql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from authenticated;/i,
  );
  assert.match(
    fixSql,
    /grant execute on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+to authenticated;/i,
  );
});

test("daily carryovers process RPC uses unqualified SQL conditional functions", () => {
  for (const functionSql of [getFunctionSql(), getFunctionSql(fixSql)]) {
    assert.doesNotMatch(functionSql, /pg_catalog\.coalesce\s*\(/i);
    assert.doesNotMatch(functionSql, /pg_catalog\.greatest\s*\(/i);
    assert.doesNotMatch(functionSql, /pg_catalog\.least\s*\(/i);
    assert.doesNotMatch(functionSql, /pg_catalog\.nullif\s*\(/i);
    assert.match(functionSql, /\bcoalesce\s*\(/i);
    assert.match(functionSql, /\bgreatest\s*\(/i);
  }
});

test("daily carryovers process RPC original and fix migration bodies match", () => {
  assert.equal(getFunctionSql(fixSql), getFunctionSql());
});

test("daily carryovers process RPC execute access is limited to authenticated", () => {
  assert.match(
    sql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from public;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from anon;/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+from authenticated;/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.process_daily_carryovers\(\s*uuid,\s*uuid,\s*date\s*\)\s+to authenticated;/i,
  );
});

test("daily carryovers process RPC validates required arguments with invalid_state", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /p_family_id is null/i);
  assert.match(functionSql, /p_child_id is null/i);
  assert.match(functionSql, /p_to_session_date is null/i);
  assert.match(
    functionSql,
    /'status', 'invalid_state'[\s\S]*'created_count', 0[\s\S]*'updated_count', 0[\s\S]*'processed_count', 0[\s\S]*'skipped_count', 0/i,
  );
});

test("daily carryovers process RPC checks auth, family member row, and child ownership", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    functionSql,
    /if current_user_id is null[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /if not public\.is_family_member\(p_family_id\)[\s\S]*'status', 'forbidden'/i,
  );
  assert.match(
    functionSql,
    /select family_members\.id[\s\S]*from public\.family_members[\s\S]*family_members\.family_id = p_family_id[\s\S]*family_members\.user_id = current_user_id/i,
  );
  assert.match(
    functionSql,
    /from public\.children[\s\S]*children\.id = p_child_id[\s\S]*children\.family_id = p_family_id/i,
  );
});

test("daily carryovers process RPC uses an existing destination session and returns not_found without creating it", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /select daily_sessions\.id[\s\S]*into destination_session_id[\s\S]*from public\.daily_sessions[\s\S]*daily_sessions\.family_id = p_family_id[\s\S]*daily_sessions\.child_id = p_child_id[\s\S]*daily_sessions\.session_date = p_to_session_date/i,
  );
  assert.match(
    functionSql,
    /if destination_session_id is null then[\s\S]*'status', 'not_found'/i,
  );
  assert.doesNotMatch(functionSql, /insert into public\.daily_sessions/i);
  assert.doesNotMatch(functionSql, /update public\.daily_sessions/i);
});

test("daily carryovers process RPC claims only eligible past source items with row locking", () => {
  const claimSql = getClaimInsertSql();

  assert.match(claimSql, /source_sessions\.session_date < p_to_session_date/i);
  assert.match(claimSql, /source_items\.deleted_at is null/i);
  assert.match(claimSql, /source_items\.is_deferred = true/i);
  assert.match(claimSql, /source_items\.is_prepared = false/i);
  assert.match(claimSql, /source_items\.carryover_processed_at is null/i);
  assert.match(claimSql, /source_items\.carryover_resolved_at is null/i);
  assert.match(claimSql, /for update of source_items skip locked/i);
});

test("daily carryovers process RPC rejects unexpected source shapes and missing template destinations", () => {
  const functionSql = getFunctionSql();

  assert.match(functionSql, /invalid_carryover_source_shape/i);
  assert.match(functionSql, /item_template_id is not null[\s\S]*is_ad_hoc = false[\s\S]*kind in \('regular', 'spot', 'rough'\)/i);
  assert.match(functionSql, /item_template_id is null[\s\S]*is_ad_hoc = true[\s\S]*kind = 'spot'/i);
  assert.match(functionSql, /missing_destination_carryover_item/i);
  assert.match(
    functionSql,
    /destination_items\.item_template_id = template_groups\.item_template_id[\s\S]*destination_items\.kind = template_groups\.kind[\s\S]*destination_items\.deleted_at is null/i,
  );
  assert.match(functionSql, /mixed_template_carryover_kinds/i);
  assert.match(
    functionSql,
    /group by claimed\.item_template_id[\s\S]*having pg_catalog\.count\(distinct claimed\.kind\) > 1/i,
  );
});

test("regular carryovers aggregate all sources per template with greatest pending and no addition", () => {
  const functionSql = getFunctionSql();
  const regularUpdate = getUpdateStatements().find((statement) =>
    /regular_groups/i.test(statement),
  );

  assert.ok(regularUpdate);
  assert.match(functionSql, /from pg_temp\.claimed_daily_carryovers as claimed[\s\S]*where claimed\.item_template_id is not null[\s\S]*and claimed\.kind = 'regular'[\s\S]*group by claimed\.item_template_id/i);
  assert.match(
    functionSql,
    /pg_catalog\.max\(\s*greatest\(\s*coalesce\(claimed\.shortage_count, 0\),\s*coalesce\(claimed\.carryover_pending_shortage_count, 0\)/i,
  );
  assert.match(functionSql, /invalid_regular_carryover_pending/i);
  assert.match(
    regularUpdate,
    /carryover_pending_shortage_count = greatest\(\s*coalesce\(destination_items\.carryover_pending_shortage_count, 0\),\s*regular_groups\.source_pending/i,
  );
  assert.doesNotMatch(regularUpdate, /carryover_pending_shortage_count\s*=.*\+/i);
});

test("template carryovers choose a stable latest representative source id", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /array_agg\(\s*claimed\.id\s+order by claimed\.source_session_date desc, claimed\.id desc\s*\)/i,
  );
  assert.match(functionSql, /carried_from_daily_item_id/i);
});

test("spot template carryovers merge due_date to the earliest non-null value", () => {
  const spotUpdate = getUpdateStatements().find((statement) =>
    /spot_groups/i.test(statement),
  );

  assert.ok(spotUpdate);
  assert.match(spotUpdate, /destination_items\.kind = 'spot'/i);
  assert.match(
    spotUpdate,
    /select pg_catalog\.min\(due_values\.due_date\)[\s\S]*values\s*\(\s*destination_items\.due_date\s*\),\s*\(\s*spot_groups\.earliest_source_due_date\s*\)[\s\S]*where due_values\.due_date is not null/i,
  );
  assert.doesNotMatch(
    spotUpdate,
    /name\s*=|unit\s*=|quantity\s*=|required_quantity\s*=|carryover_pending_shortage_count\s*=/i,
  );
});

test("rough template carryovers only mark carryover metadata and never overwrite rough_state", () => {
  const roughUpdate = getUpdateStatements().find((statement) =>
    /rough_groups/i.test(statement),
  );

  assert.ok(roughUpdate);
  assert.match(roughUpdate, /destination_items\.kind = 'rough'/i);
  assert.match(roughUpdate, /is_carryover = true/i);
  assert.match(roughUpdate, /carried_from_daily_item_id = rough_groups\.carried_from_daily_item_id/i);
  assert.doesNotMatch(
    roughUpdate,
    /rough_state\s*=|required_quantity\s*=|observed_quantity\s*=|shortage_count\s*=|carryover_pending_shortage_count\s*=|is_checked\s*=|is_prepared\s*=|is_deferred\s*=/i,
  );
});

test("destination template updates run only when values change and increment version only there", () => {
  const updateStatements = getUpdateStatements();

  assert.equal(updateStatements.length, 3);
  for (const updateStatement of updateStatements) {
    assert.match(updateStatement, /is distinct from/i);
    assert.match(updateStatement, /version = destination_items\.version \+ 1/i);
  }
});

test("ad hoc carryovers insert only source ad hoc spot rows with conflict protection", () => {
  const adHocInsert = getAdHocInsertSql();

  assert.match(adHocInsert, /insert into public\.daily_items/i);
  assert.match(adHocInsert, /from pg_temp\.claimed_daily_carryovers as claimed/i);
  assert.match(adHocInsert, /claimed\.kind = 'spot'/i);
  assert.match(adHocInsert, /claimed\.item_template_id is null/i);
  assert.match(adHocInsert, /claimed\.is_ad_hoc = true/i);
  assert.match(adHocInsert, /claimed\.name/i);
  assert.match(adHocInsert, /claimed\.unit/i);
  assert.match(adHocInsert, /claimed\.quantity/i);
  assert.match(adHocInsert, /claimed\.due_date/i);
  assert.match(adHocInsert, /claimed\.sort_order/i);
  assert.match(adHocInsert, /false,\s*false,\s*false/i);
  assert.match(adHocInsert, /true,\s*null,\s*claimed\.quantity,\s*null,\s*null,\s*null,\s*true,\s*claimed\.id/i);
  assert.match(adHocInsert, /version[\s\S]*1/i);
  assert.match(
    adHocInsert,
    /on conflict \(daily_session_id, carried_from_daily_item_id\)\s+where is_ad_hoc = true\s+and carried_from_daily_item_id is not null\s+and deleted_at is null\s+do nothing/i,
  );
  assert.match(
    adHocInsert,
    /returning daily_items\.carried_from_daily_item_id as source_id/i,
  );
});

test("ad hoc conflicts are skipped only after confirming an active destination row", () => {
  const functionSql = getFunctionSql();
  const processedSetSql = getProcessedSetSql();

  assert.doesNotMatch(functionSql, /candidate_count|claimed_count/i);
  assert.doesNotMatch(functionSql, /candidate_count\s*-\s*claimed_count/i);
  assert.doesNotMatch(functionSql, /skipped_count\s*:=\s*.*claimed_count/i);
  assert.match(functionSql, /missing_existing_ad_hoc_carryover_item/i);
  assert.match(
    processedSetSql,
    /not exists \(\s*select 1\s*from pg_temp\.inserted_ad_hoc_daily_carryovers as inserted_ad_hoc[\s\S]*inserted_ad_hoc\.source_id = claimed\.id[\s\S]*\)[\s\S]*and exists \(\s*select 1\s*from public\.daily_items as destination_items[\s\S]*destination_items\.daily_session_id = destination_session_id[\s\S]*destination_items\.is_ad_hoc = true[\s\S]*destination_items\.carried_from_daily_item_id = claimed\.id[\s\S]*destination_items\.deleted_at is null/i,
  );
  assert.match(
    functionSql,
    /select pg_catalog\.count\(\*\)::integer\s+into skipped_count\s+from pg_temp\.processable_daily_carryover_sources as processable_sources\s+where processable_sources\.reason = 'ad_hoc_existing'/i,
  );
});

test("processed source set is explicit and never pre-registers all template claims", () => {
  const processedSetSql = getProcessedSetSql();

  assert.doesNotMatch(
    processedSetSql,
    /select\s+claimed\.id,\s*'template'[\s\S]*where claimed\.item_template_id is not null/i,
  );
  assert.match(
    processedSetSql,
    /join pg_temp\.successful_regular_carryover_groups as successful_groups[\s\S]*where claimed\.kind = 'regular'/i,
  );
  assert.match(
    processedSetSql,
    /join pg_temp\.successful_spot_carryover_groups as successful_groups[\s\S]*where claimed\.kind = 'spot'/i,
  );
  assert.match(
    processedSetSql,
    /join pg_temp\.successful_rough_carryover_groups as successful_groups[\s\S]*where claimed\.kind = 'rough'/i,
  );
  assert.match(
    processedSetSql,
    /insert into pg_temp\.processable_daily_carryover_sources[\s\S]*select\s+inserted_ad_hoc\.source_id,\s*'ad_hoc_inserted'[\s\S]*from pg_temp\.inserted_ad_hoc_daily_carryovers as inserted_ad_hoc/i,
  );
  assert.match(
    processedSetSql,
    /insert into pg_temp\.processable_daily_carryover_sources[\s\S]*select\s+claimed\.id,\s*'ad_hoc_existing'[\s\S]*from pg_temp\.claimed_daily_carryovers as claimed[\s\S]*destination_items\.carried_from_daily_item_id = claimed\.id/i,
  );
  assert.match(processedSetSql, /unprocessed_claimed_carryover_source/i);
});

test("template successful groups combine update returning and already satisfied checks", () => {
  const functionSql = getFunctionSql();

  for (const kind of ["regular", "spot", "rough"]) {
    assert.match(
      functionSql,
      new RegExp(
        `updated_${kind} as \\([\\s\\S]*?returning destination_items\\.item_template_id[\\s\\S]*?insert into pg_temp\\.successful_${kind}_carryover_groups`,
        "i",
      ),
    );
    assert.match(
      functionSql,
      new RegExp(
        `already_satisfied_${kind} as \\([\\s\\S]*?join public\\.daily_items as destination_items[\\s\\S]*?destination_items\\.daily_session_id = destination_session_id[\\s\\S]*?destination_items\\.kind = '${kind}'[\\s\\S]*?destination_items\\.deleted_at is null[\\s\\S]*?insert into pg_temp\\.successful_${kind}_carryover_groups`,
        "i",
      ),
    );
    assert.match(
      functionSql,
      new RegExp(`unsatisfied_${kind}_carryover_destination`, "i"),
    );
  }

  assert.match(
    functionSql,
    /already_satisfied_regular[\s\S]*destination_items\.carryover_pending_shortage_count is not distinct from\s+greatest\(/i,
  );
  assert.match(
    functionSql,
    /already_satisfied_spot[\s\S]*destination_items\.due_date is not distinct from \(\s*select pg_catalog\.min\(due_values\.due_date\)/i,
  );
  assert.doesNotMatch(
    functionSql.match(/already_satisfied_rough[\s\S]*?insert into pg_temp\.successful_rough_carryover_groups/i)?.[0] ?? "",
    /rough_state\s*=/i,
  );
});

test("source processed update sets processed timestamp and version without operator or resolved changes", () => {
  const sourceProcessed = getSourceProcessedSql();

  assert.match(sourceProcessed, /carryover_processed_at = run_at/i);
  assert.match(sourceProcessed, /version = source_items\.version \+ 1/i);
  assert.match(
    sourceProcessed,
    /select processable_sources\.source_id\s+from pg_temp\.processable_daily_carryover_sources as processable_sources/i,
  );
  assert.doesNotMatch(
    sourceProcessed,
    /select claimed\.id\s+from pg_temp\.claimed_daily_carryovers as claimed/i,
  );
  assert.match(sourceProcessed, /source_items\.carryover_processed_at is null/i);
  assert.match(sourceProcessed, /source_items\.carryover_resolved_at is null/i);
  assert.doesNotMatch(
    sourceProcessed,
    /updated_by_member_id\s*=|updated_by_user_id\s*=|updated_by_display_name\s*=|carryover_resolved_at\s*=/i,
  );
});

test("daily carryovers process RPC returns success counts without conflict status", () => {
  const functionSql = getFunctionSql();

  assert.match(
    functionSql,
    /'status', 'success'[\s\S]*'created_count', created_count[\s\S]*'updated_count', updated_count[\s\S]*'processed_count', processed_count[\s\S]*'skipped_count', skipped_count/i,
  );
  assert.doesNotMatch(functionSql, /'status', 'conflict'/i);
});

test("daily carryovers process RPC does not include unrelated daily workflows", () => {
  const functionSql = getFunctionSql();

  assert.doesNotMatch(
    functionSql,
    /checked_at|checked_by_|prepared_at|prepared_by_|thanks_|carryover_resolved_at\s*=|set_checked|complete_daily_check|ensure_daily_session|load_daily_data/i,
  );
  assert.doesNotMatch(functionSql, /insert into public\.item_templates/i);
});

test("daily carryovers process RPC does not intentionally swallow SQL exceptions", () => {
  const functionSql = getFunctionSql();

  assert.doesNotMatch(functionSql, /\bexception\b[\s\S]*\bwhen\b/i);
  assert.match(functionSql, /raise exception 'invalid_carryover_source_shape'/i);
  assert.match(functionSql, /raise exception 'invalid_regular_carryover_pending'/i);
  assert.match(functionSql, /raise exception 'missing_destination_carryover_item'/i);
});
