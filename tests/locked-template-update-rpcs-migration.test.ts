import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName =
  "20260806000100_add_locked_template_update_rpcs.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

const functionNames = [
  "update_family_item_template",
  "update_family_rough_item_state",
  "update_family_spot_item_template",
] as const;

type FunctionName = (typeof functionNames)[number];

const extractFunctionSql = (source: string, functionName: FunctionName) => {
  const functionStart = source.search(
    new RegExp(
      `create or replace function public\\.${functionName}\\s*\\(`,
      "i",
    ),
  );
  assert.ok(functionStart >= 0);

  const functionEnd = source.indexOf("$$;", functionStart);
  assert.ok(functionEnd > functionStart);

  return source.slice(functionStart, functionEnd + 3);
};

const getFunctionSql = (functionName: FunctionName) =>
  extractFunctionSql(sql, functionName);

const getUpdateStatements = (functionName: FunctionName) =>
  [
    ...getFunctionSql(functionName).matchAll(
      /update public\.item_templates[\s\S]*?;/gi,
    ),
  ].map((match) => match[0]);

const getSetClause = (updateSql: string) => {
  const setStart = updateSql.search(/\bset\b/i);
  const whereStart = updateSql.search(/\bwhere\b/i);
  assert.ok(setStart >= 0);
  assert.ok(whereStart > setStart);
  return updateSql.slice(setStart, whereStart);
};

const signatures: Record<FunctionName, string> = {
  update_family_item_template: String.raw`public\.update_family_item_template\(\s*uuid,\s*uuid,\s*uuid,\s*timestamptz,\s*text,\s*integer,\s*text\s*\)`,
  update_family_rough_item_state: String.raw`public\.update_family_rough_item_state\(\s*uuid,\s*uuid,\s*uuid,\s*timestamptz,\s*text\s*\)`,
  update_family_spot_item_template: String.raw`public\.update_family_spot_item_template\(\s*uuid,\s*uuid,\s*uuid,\s*timestamptz,\s*text,\s*integer,\s*smallint\[\]\s*\)`,
};

test("locked template update migration has the expected timestamp and one exact definition per RPC", () => {
  const migrationFiles = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(migrationFiles.includes(migrationName));
  assert.equal(
    migrationFiles.some((file) =>
      file.startsWith("20260806000100_") && file !== migrationName,
    ),
    false,
  );

  for (const functionName of functionNames) {
    const definitionPattern = new RegExp(
      `create or replace function public\\.${functionName}\\s*\\(`,
      "i",
    );
    const definingMigrations = migrationFiles.filter((file) =>
      definitionPattern.test(
        readFileSync(`supabase/migrations/${file}`, "utf8"),
      ),
    );
    assert.deepEqual(definingMigrations, [migrationName]);
  }
});

test("all three RPCs have exact signatures and invoker-safe function attributes", () => {
  assert.match(
    sql,
    /create or replace function public\.update_family_item_template\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_item_template_id uuid,\s*p_expected_updated_at timestamptz,\s*p_name text,\s*p_default_quantity integer,\s*p_unit text\s*\)/i,
  );
  assert.match(
    sql,
    /create or replace function public\.update_family_rough_item_state\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_item_template_id uuid,\s*p_expected_updated_at timestamptz,\s*p_current_rough_state text\s*\)/i,
  );
  assert.match(
    sql,
    /create or replace function public\.update_family_spot_item_template\(\s*p_family_id uuid,\s*p_child_id uuid,\s*p_item_template_id uuid,\s*p_expected_updated_at timestamptz,\s*p_name text,\s*p_default_quantity integer,\s*p_weekdays smallint\[\]\s*\)/i,
  );

  for (const functionName of functionNames) {
    const functionSql = getFunctionSql(functionName);
    assert.match(functionSql, /returns jsonb/i);
    assert.match(functionSql, /language plpgsql/i);
    assert.match(functionSql, /security invoker/i);
    assert.doesNotMatch(functionSql, /security definer/i);
    assert.match(functionSql, /set search_path = ''/i);
  }
});

test("execute access for every new RPC is restricted to authenticated", () => {
  for (const functionName of functionNames) {
    const signature = signatures[functionName];
    assert.match(
      sql,
      new RegExp(`revoke all on function ${signature} from public;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function ${signature} from anon;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function ${signature} from authenticated;`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function ${signature} to authenticated;`,
        "i",
      ),
    );
  }
});

test("all three RPCs authenticate, verify membership and scope, then lock child before template", () => {
  for (const functionName of functionNames) {
    const functionSql = getFunctionSql(functionName);
    const membership = functionSql.indexOf(
      "public.is_family_member(p_family_id)",
    );
    const childLock = functionSql.search(
      /select children\.id[\s\S]*?from public\.children[\s\S]*?children\.id = p_child_id[\s\S]*?children\.family_id = p_family_id[\s\S]*?for update;/i,
    );
    const templateLock = functionSql.search(
      /from public\.item_templates[\s\S]*?item_templates\.id = p_item_template_id[\s\S]*?item_templates\.family_id = p_family_id[\s\S]*?item_templates\.child_id = p_child_id[\s\S]*?for update;/i,
    );

    assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
    assert.ok(membership >= 0);
    assert.ok(childLock > membership);
    assert.ok(templateLock > childLock);
    assert.match(
      functionSql,
      /if locked_child_id is null then[\s\S]*?'status', 'forbidden'/i,
    );
    assert.match(
      functionSql,
      /if target_template_id is null then[\s\S]*?'status', 'not_found'/i,
    );
    assert.match(
      functionSql,
      /if not target_is_active then[\s\S]*?'reason', 'inactive_template'/i,
    );
  }
});

test("all three RPCs compare the required timestamp after the template lock and before no-op detection", () => {
  for (const functionName of functionNames) {
    const functionSql = getFunctionSql(functionName);
    const templateLockEnd = functionSql.indexOf(
      "for update;",
      functionSql.indexOf("from public.item_templates"),
    );
    const tokenGuard = functionSql.indexOf(
      "target_updated_at is distinct from p_expected_updated_at",
    );
    const changedAssignment = functionSql.indexOf("changed :=");

    assert.match(functionSql, /p_expected_updated_at is null/i);
    assert.ok(templateLockEnd >= 0);
    assert.ok(tokenGuard > templateLockEnd);
    assert.ok(changedAssignment > tokenGuard);
    assert.match(
      functionSql,
      /target_updated_at is distinct from p_expected_updated_at[\s\S]*?'status', 'conflict'[\s\S]*?'reason', 'stale_template'/i,
    );
    assert.doesNotMatch(
      functionSql,
      /clock_timestamp\s*\(|statement_timestamp\s*\(|transaction_timestamp\s*\(|\bnow\s*\(/i,
    );
  }
});

test("all three RPCs return the common statuses, reasons, and canonical success metadata", () => {
  for (const functionName of functionNames) {
    const functionSql = getFunctionSql(functionName);
    for (const status of [
      "success",
      "conflict",
      "forbidden",
      "not_found",
      "invalid_state",
    ]) {
      assert.match(functionSql, new RegExp(`'status', '${status}'`, "i"));
    }
    for (const reason of [
      "invalid_input",
      "stale_template",
      "inactive_template",
      "wrong_kind",
    ]) {
      assert.match(functionSql, new RegExp(`'reason', '${reason}'`, "i"));
    }
    for (const key of [
      "status",
      "changed",
      "family_id",
      "child_id",
      "item_template_id",
      "kind",
      "name",
      "default_quantity",
      "unit",
      "current_rough_state",
      "weekdays",
      "sort_order",
      "is_active",
      "updated_at",
    ]) {
      assert.match(functionSql, new RegExp(`'${key}'`, "i"));
    }
    assert.match(
      functionSql,
      /'status', 'success',\s*'changed', changed,\s*'reason', null/i,
    );
  }
});

test("regular and rough edit validates the UI contract and rejects spot or unit spoofing", () => {
  const functionSql = getFunctionSql("update_family_item_template");

  assert.match(functionSql, /pg_catalog\.btrim\(p_name\)/i);
  assert.match(functionSql, /pg_catalog\.char_length\(trimmed_name\) < 1/i);
  assert.match(functionSql, /pg_catalog\.char_length\(trimmed_name\) > 80/i);
  assert.match(functionSql, /p_default_quantity < 0/i);
  assert.match(functionSql, /p_default_quantity > 5/i);
  assert.match(functionSql, /target_kind not in \('regular', 'rough'\)/i);
  assert.match(functionSql, /target_kind = 'regular' and p_unit is not null/i);
  assert.match(
    functionSql,
    /target_kind = 'rough'[\s\S]*?p_unit is null[\s\S]*?pg_catalog\.char_length\(p_unit\) > 10/i,
  );
});

test("regular and rough edit only changes the allowed columns inside its changed branch", () => {
  const functionSql = getFunctionSql("update_family_item_template");
  const updates = getUpdateStatements("update_family_item_template");
  const changedBranch = functionSql.indexOf("if changed then");

  assert.equal(updates.length, 2);
  assert.ok(changedBranch >= 0);
  for (const updateSql of updates) {
    assert.ok(functionSql.indexOf(updateSql) > changedBranch);
    const setClause = getSetClause(updateSql);
    assert.match(setClause, /name = trimmed_name/i);
    assert.match(setClause, /default_quantity = p_default_quantity/i);
    assert.doesNotMatch(
      setClause,
      /family_id|child_id|kind|is_active|sort_order|weekday|current_rough_state|created_at|\bid\s*=/i,
    );
  }
  assert.doesNotMatch(getSetClause(updates[0]), /\bunit\s*=/i);
  assert.match(getSetClause(updates[1]), /unit = p_unit/i);
  assert.match(updates[0], /item_templates\.kind = 'regular'/i);
  assert.match(updates[1], /item_templates\.kind = 'rough'/i);
});

test("rough state RPC validates its whitelist and updates only current_rough_state", () => {
  const functionSql = getFunctionSql("update_family_rough_item_state");
  const updates = getUpdateStatements("update_family_rough_item_state");

  assert.match(
    functionSql,
    /p_current_rough_state not in \('enough', 'low', 'refill'\)/i,
  );
  assert.match(functionSql, /target_kind <> 'rough'/i);
  assert.match(
    functionSql,
    /changed := target_current_rough_state is distinct from p_current_rough_state/i,
  );
  assert.equal(updates.length, 1);
  const setClause = getSetClause(updates[0]);
  assert.match(setClause, /current_rough_state = p_current_rough_state/i);
  assert.doesNotMatch(
    setClause,
    /\bname\s*=|default_quantity|\bunit\s*=|sort_order|is_active|kind|family_id|child_id/i,
  );
  assert.ok(
    functionSql.indexOf(updates[0]) > functionSql.indexOf("if changed then"),
  );
});

test("spot edit validates and normalizes a duplicate-free weekday set", () => {
  const functionSql = getFunctionSql("update_family_spot_item_template");

  assert.match(functionSql, /pg_catalog\.cardinality\(p_weekdays\) > 7/i);
  assert.match(
    functionSql,
    /weekday_rows\.weekday is null[\s\S]*?weekday_rows\.weekday < 0[\s\S]*?weekday_rows\.weekday > 6/i,
  );
  assert.match(
    functionSql,
    /pg_catalog\.count\(\*\)[\s\S]*?pg_catalog\.count\(distinct weekday_rows\.weekday\)/i,
  );
  assert.match(
    functionSql,
    /pg_catalog\.array_agg\([\s\S]*?weekday_rows\.weekday[\s\S]*?order by weekday_rows\.weekday[\s\S]*?into normalized_weekdays/i,
  );
  assert.match(functionSql, /target_kind <> 'spot'/i);
  assert.match(functionSql, /p_default_quantity < 0/i);
  assert.match(functionSql, /p_default_quantity > 5/i);
  assert.match(functionSql, /pg_catalog\.char_length\(trimmed_name\) > 80/i);
});

test("spot edit locks weekday rows after child and template and replaces them only when changed", () => {
  const functionSql = getFunctionSql("update_family_spot_item_template");
  const childLock = functionSql.indexOf("from public.children");
  const templateLock = functionSql.indexOf("from public.item_templates");
  const weekdayLock = functionSql.search(
    /perform item_template_weekdays\.item_template_id[\s\S]*?from public\.item_template_weekdays[\s\S]*?order by item_template_weekdays\.weekday[\s\S]*?for update;/i,
  );
  const changedBranch = functionSql.indexOf("if changed then");
  const templateUpdate = functionSql.indexOf("update public.item_templates");
  const weekdayDelete = functionSql.indexOf(
    "delete from public.item_template_weekdays",
  );
  const weekdayInsert = functionSql.indexOf(
    "insert into public.item_template_weekdays",
  );

  assert.ok(childLock >= 0);
  assert.ok(templateLock > childLock);
  assert.ok(weekdayLock > templateLock);
  assert.ok(changedBranch > weekdayLock);
  assert.ok(templateUpdate > changedBranch);
  assert.ok(weekdayDelete > templateUpdate);
  assert.ok(weekdayInsert > weekdayDelete);
  assert.match(
    functionSql,
    /changed := target_name is distinct from trimmed_name[\s\S]*?target_default_quantity is distinct from p_default_quantity[\s\S]*?target_weekdays is distinct from normalized_weekdays/i,
  );
  assert.match(
    functionSql,
    /foreach weekday_value in array normalized_weekdays[\s\S]*?insert into public\.item_template_weekdays/i,
  );
});

test("spot edit updates only name and quantity and keeps the old compatibility RPC untouched", () => {
  const updates = getUpdateStatements("update_family_spot_item_template");

  assert.equal(updates.length, 1);
  const setClause = getSetClause(updates[0]);
  assert.match(setClause, /name = trimmed_name/i);
  assert.match(setClause, /default_quantity = p_default_quantity/i);
  assert.doesNotMatch(
    setClause,
    /\bunit\s*=|current_rough_state|sort_order|is_active|kind|family_id|child_id/i,
  );
  assert.doesNotMatch(
    sql,
    /(?:create or replace|drop) function public\.update_family_spot_item_template_weekdays\s*\(/i,
  );
  assert.doesNotMatch(sql, /drop function/i);
});

test("the migration has no unrelated DDL, privilege hardening, actor inputs, or external effects", () => {
  assert.doesNotMatch(
    sql,
    /\b(create|alter|drop)\s+(table|schema|type|constraint|trigger|policy|index)|\badd\s+constraint/i,
  );
  assert.doesNotMatch(
    sql,
    /revoke\s+(insert|update|delete|all)\s+on\s+(?:table\s+)?public\.(?:item_templates|item_template_weekdays)/i,
  );
  assert.doesNotMatch(
    sql,
    /p_(?:actor|member|user|updated_by|created_by|timestamp|updated_at_value)|dynamic\s+sql|\bexecute\s+format|\bformat\s*\(|service_role|supabase_service_role|pg_notify|http|net\./i,
  );
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  assert.equal(
    (sql.match(/\bdelete\s+from\s+public\.[a-z_]+/gi) ?? []).map(
      (value) => value.toLowerCase(),
    ).join(","),
    "delete from public.item_template_weekdays",
  );
});

test("the migration and function extractor are BOM-free and CRLF-safe", () => {
  assert.notDeepEqual(
    [...migrationBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );

  const crlfSql = sql.replace(/\r?\n/g, "\r\n");
  for (const functionName of functionNames) {
    const functionSql = extractFunctionSql(crlfSql, functionName);
    assert.match(functionSql, /returns jsonb/i);
    assert.match(functionSql, /if changed then[\s\S]*?update public\.item_templates/i);
  }
});
