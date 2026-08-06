import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260806000200_harden_template_writer_permissions.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

const rpcContracts = [
  {
    name: "add_family_item_template",
    signature: "uuid, uuid, text, text, integer, text, text",
    source:
      "supabase/migrations/20260718000200_add_family_item_template_rpc.sql",
  },
  {
    name: "add_family_spot_item_template",
    signature: "uuid, uuid, text, integer, smallint[]",
    source:
      "supabase/migrations/20260717000100_allow_seven_shared_spot_weekdays.sql",
  },
  {
    name: "update_family_spot_item_template_weekdays",
    signature: "uuid, uuid, uuid, smallint[], text, integer",
    source:
      "supabase/migrations/20260717000200_update_shared_spot_item_weekdays.sql",
  },
  {
    name: "update_family_item_template_sort_orders",
    signature: "uuid, uuid, jsonb",
    source:
      "supabase/migrations/20260718000100_add_shared_item_template_sort_order_rpc.sql",
  },
  {
    name: "delete_family_item_template_for_day",
    signature: "uuid, uuid, date, uuid, timestamptz, uuid, integer",
    source:
      "supabase/migrations/20260805000100_add_atomic_shared_item_delete_rpc.sql",
  },
  {
    name: "update_family_item_template",
    signature: "uuid, uuid, uuid, timestamptz, text, integer, text",
    source:
      "supabase/migrations/20260806000100_add_locked_template_update_rpcs.sql",
  },
  {
    name: "update_family_rough_item_state",
    signature: "uuid, uuid, uuid, timestamptz, text",
    source:
      "supabase/migrations/20260806000100_add_locked_template_update_rpcs.sql",
  },
  {
    name: "update_family_spot_item_template",
    signature: "uuid, uuid, uuid, timestamptz, text, integer, smallint[]",
    source:
      "supabase/migrations/20260806000100_add_locked_template_update_rpcs.sql",
  },
] as const;

const immutableMigrationHashes: Record<string, string> = {
  "20260711000100_create_family_sharing_schema.sql":
    "4790da8f45f480e0252f8cf3acd823ce8109c13799cf777b365480d7c0d2872c",
  "20260711000200_add_create_family_rpc.sql":
    "86b5e4e5f9fd23a49fa5c742159e8f60c3a9b7ea9f6eaa6a0d9a7706619e663a",
  "20260712000100_add_family_invite_rpcs.sql":
    "e8c4e6d8f87cf6e96e5ae922a7cceb4194204205f689576386f359eb73ebad14",
  "20260712000200_add_family_data_sharing_foundation.sql":
    "59a29ae8b9dcc0423cc0cd1653f06f32b450f4e3231447849c16cddb8c581b68",
  "20260716000100_add_shared_spot_item_rpc.sql":
    "135988d3f2f3bb20baa302d76bc77b7e67ba74842725bda4e234c19c0edc3e82",
  "20260716000200_fix_shared_spot_item_rpc_coalesce.sql":
    "287bc09347df3bb48400088420280ef05d443400c1421e8bb1219a8a7d1f0f4f",
  "20260717000100_allow_seven_shared_spot_weekdays.sql":
    "2c40d5ed92006419ed5801d10b4cd5473705e70bc434abe021541ce5ba8cb0a5",
  "20260717000200_update_shared_spot_item_weekdays.sql":
    "0fb0fae93627648b47d4c8960052a6de4bb05d08851cd5bc3bf81438f106e687",
  "20260718000100_add_shared_item_template_sort_order_rpc.sql":
    "d0f8aaa29d2312ebb7a26bc279444cd598cf7ff48ce9c5e0e606b952bf781d62",
  "20260718000200_add_family_item_template_rpc.sql":
    "6ca1943b63cde2ae5628c1840c098b19b1252d86391ba2b35baed6ed48552db0",
  "20260719000100_expand_daily_sharing_schema.sql":
    "98532867fa808c37fe2cdb1b41a1f916b42228391661568ff17011d67eec9a3b",
  "20260719000200_fix_daily_member_fk_delete_behavior.sql":
    "c4bdde70228e198ac25369d043e5b82ae8822b9cd609563372cad355e9871e11",
  "20260719000300_add_load_daily_data_rpc.sql":
    "8cf1d72686ddf36e3487ab207ec46e51a254c7a69c03fd5f80a35667bb708650",
  "20260719000400_add_update_daily_item_rpc.sql":
    "f8f40ad0f36cf51b7852c9e8454a61d863492e8471c83b96a080011c2f676dde",
  "20260719000500_add_complete_daily_check_rpc.sql":
    "25ac2d62e2c50f3953a15dbde2c26a3b5e9bdcd1ac32441854ea15746ced38c9",
  "20260719000600_add_ensure_daily_session_rpc.sql":
    "6f82c48c24571847f3f9e7d71cbd04bcd3a665996e33ca9bb52c4eae7a2ef163",
  "20260719000700_add_process_daily_carryovers_rpc.sql":
    "49c03e08e602393aa9559bb5e8e40efb7f8bb6b15b0292c56459aa520140b72d",
  "20260724000100_fix_process_daily_carryovers_rpc_qualification.sql":
    "49c03e08e602393aa9559bb5e8e40efb7f8bb6b15b0292c56459aa520140b72d",
  "20260726000100_add_complete_daily_preparation_rpc.sql":
    "c5a6bb99a18d1b5d08081fbd7fbe1b234dee4bb005aaa9b1e49ba44e78dd5332",
  "20260726000200_fix_daily_carryover_completion_safety.sql":
    "9395678bdcb819a4b6f944b9066715107c486556bf3f37542e19df370c97bfd3",
  "20260727000100_add_update_daily_preparation_items_rpc.sql":
    "66ea9df86b45d782552c6cb7f6fbe89ebd890e4495e284d3814dace45d3a1f2f",
  "20260803000100_add_send_daily_thanks_rpc.sql":
    "0ba4393c33b4aab244755ed9cb9a351bde7170fe82e5d1d2e67175a05937f76a",
  "20260805000100_add_atomic_shared_item_delete_rpc.sql":
    "c66c230ae5ab0b9a0588be5db34a89d03cbf977fcfc7800169a9b4b6a0a1c26f",
  "20260805000200_harden_daily_carryover_references.sql":
    "c1869b1d4b5289fe8c8e668c12df6a689e817397229d53b33dc80467f40847d3",
  "20260805000300_harden_daily_session_scope.sql":
    "bc836899d65ce87ccf9b9a9e04b37c6f5c641926aac7b8b073d5f3a139484068",
  "20260805000400_fix_carryover_fk_maintenance.sql":
    "a397fb7ebb0ec6569e20e8d9afadd19eb1303ec0b00810a3f77c3d8ec2c2580b",
  "20260806000100_add_locked_template_update_rpcs.sql":
    "3f462a3dcae3d7cde3df12492233e8b6a17744e8b8c0a95ece336f66856e3cc7",
  "20260806000300_stop_ensure_daily_session_backfill.sql":
    "4ab3011a34bbd258a4c42fafc9e5f8dfd535aea86b8f266fb6733e3a38d7b6c7",
};

const regexSignature = (signature: string) =>
  signature
    .replaceAll("[", String.raw`\[`)
    .replaceAll("]", String.raw`\]`)
    .replaceAll(", ", String.raw`\s*,\s*`);

const extractFunctionSql = (source: string, functionName: string) => {
  const start = source.search(
    new RegExp(`create or replace function public\\.${functionName}\\s*\\(`, "i"),
  );
  assert.ok(start >= 0);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
};

test("hardening targets exactly the eight template writer RPC signatures", () => {
  const hardenedNames = [
    ...sql.matchAll(
      /alter function public\.([a-z0-9_]+)\s*\([^;]+?\)\s+security definer;/gi,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(
    hardenedNames,
    rpcContracts.map(({ name }) => name),
  );

  for (const { name, signature } of rpcContracts) {
    const exactSignature = `public\\.${name}\\(\\s*${regexSignature(signature)}\\s*\\)`;
    assert.match(
      sql,
      new RegExp(`alter function ${exactSignature}\\s+owner to postgres;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`alter function ${exactSignature}\\s+security definer;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `alter function ${exactSignature}\\s+set search_path = '';`,
        "i",
      ),
    );
  }
});

test("execute ACLs allow authenticated only and add no service-role grant", () => {
  for (const { name, signature } of rpcContracts) {
    const exactSignature = `public\\.${name}\\(\\s*${regexSignature(signature)}\\s*\\)`;
    assert.match(
      sql,
      new RegExp(
        `revoke all on function ${exactSignature}\\s+from public, anon, authenticated;`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function ${exactSignature}\\s+to authenticated;`,
        "i",
      ),
    );
  }

  assert.doesNotMatch(sql, /grant\s+[\s\S]*?\s+to\s+(?:public|anon|service_role)\b/i);
});

test("direct template writes are revoked while existing SELECT grants remain", () => {
  for (const tableName of ["item_templates", "item_template_weekdays"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke insert, update, delete on table public\\.${tableName}\\s+from public, anon, authenticated;`,
        "i",
      ),
    );
  }

  assert.doesNotMatch(
    sql,
    /revoke\s+(?:all(?: privileges)?|[^;]*\bselect\b)[^;]*on table/i,
  );
  assert.doesNotMatch(sql, /grant\s+[^;]*on table/i);

  const templateFoundation = readFileSync(
    "supabase/migrations/20260711000100_create_family_sharing_schema.sql",
    "utf8",
  );
  const weekdayFoundation = readFileSync(
    "supabase/migrations/20260712000200_add_family_data_sharing_foundation.sql",
    "utf8",
  );
  assert.match(
    templateFoundation,
    /grant select, insert, update, delete on public\.item_templates to authenticated;/i,
  );
  assert.match(
    weekdayFoundation,
    /grant select, insert, update, delete\s+on public\.item_template_weekdays\s+to authenticated;/i,
  );
});

test("hardening preserves authenticated scope checks and child-first locking in every body", () => {
  for (const { name, source } of rpcContracts) {
    const sourceSql = readFileSync(source, "utf8");
    const functionSql = extractFunctionSql(sourceSql, name);
    const membership = functionSql.indexOf("public.is_family_member(p_family_id)");
    const childLock = functionSql.search(
      /from public\.children[\s\S]*?family_id = p_family_id[\s\S]*?for update;/i,
    );
    const firstTemplateAccess = functionSql.search(
      /(?:from|insert into|update) public\.item_templates/i,
    );

    assert.match(functionSql, /current_user_id uuid := auth\.uid\(\)/i);
    assert.match(functionSql, /if current_user_id is null then/i);
    assert.ok(membership >= 0);
    assert.ok(childLock > membership);
    assert.ok(firstTemplateAccess > childLock);
    assert.match(functionSql, /p_child_id/i);
    assert.match(functionSql, /(?:raise exception|'reason', 'invalid_input')/i);
  }
});

test("the permission-only migration cannot alter function bodies, lock order, RLS, or schema", () => {
  assert.doesNotMatch(sql, /create\s+(?:or replace\s+)?function/i);
  assert.doesNotMatch(sql, /drop\s+function/i);
  assert.doesNotMatch(sql, /\bas\s+\$\$/i);
  assert.doesNotMatch(sql, /alter\s+table|create\s+table|create\s+policy|drop\s+policy/i);
  assert.doesNotMatch(sql, /execute\s+format|\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /start_family_data_sharing/i);
});

test("all pre-existing migrations, including pending 00300, retain exact bytes", () => {
  for (const [fileName, expectedHash] of Object.entries(
    immutableMigrationHashes,
  )) {
    const bytes = readFileSync(`supabase/migrations/${fileName}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash);
  }
});

test("the new migration and static test are UTF-8 without BOM and tolerate CRLF", () => {
  assert.equal(migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.doesNotMatch(sql, /\r(?!\n)/);

  const testBytes = readFileSync(
    "tests/template-writer-security-hardening-migration.test.ts",
  );
  assert.equal(testBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);

  const crlfSql = sql.replace(/\r?\n/g, "\r\n");
  assert.match(
    crlfSql,
    /alter function public\.add_family_item_template\([\s\S]*?\) security definer;/i,
  );
});
