import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260815000200_expand_member_names_and_allow_daily_corrections.sql";
const migrationBytes = readFileSync(migrationPath);
const sql = migrationBytes.toString("utf8");

test("family member correction migration is ordered and BOM-free", () => {
  assert.equal(migrationBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(migrationPath, /20260815000200_/);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/i);
});

test("family member display names expand from three to eight characters", () => {
  assert.match(
    sql,
    /drop constraint family_members_display_name_check[\s\S]*add constraint family_members_display_name_check check \([\s\S]*char_length\(display_name\) between 1 and 8/i,
  );
  assert.match(sql, /left\(normalized_display_name, 3\);'[\s\S]*left\(normalized_display_name, 8\);'/i);
  assert.match(sql, /> 3'[\s\S]*> 8'/i);
  assert.match(sql, /create_family_display_name_contract_not_found/i);
  assert.match(sql, /accept_invite_display_name_contract_not_found/i);
});

test("existing member names are corrected only from unambiguous auth metadata", () => {
  assert.match(sql, /raw_user_meta_data -> 'full_name'/i);
  assert.match(sql, /raw_user_meta_data -> 'name'/i);
  assert.doesNotMatch(sql, /raw_user_meta_data ->> 'email'|split_part\([^)]*email/i);
  assert.match(
    sql,
    /full_name is not null[\s\S]*metadata_name is null[\s\S]*metadata_name = metadata_names\.full_name/i,
  );
  assert.match(sql, /char_length\(family_members\.display_name\) = 3/i);
  assert.match(sql, /char_length\(resolved_names\.display_name\) between 4 and 8/i);
  assert.match(sql, /left\(resolved_names\.display_name, 3\) = family_members\.display_name/i);
  assert.match(
    sql,
    /family_members\.id = corrections\.member_id[\s\S]*family_members\.user_id = corrections\.user_id[\s\S]*family_members\.display_name = corrections\.old_display_name/i,
  );
});

test("daily actor snapshots are corrected only for the same member and old truncated value", () => {
  for (const actor of ["checked", "prepared", "thanks_sent", "thanks_received"]) {
    assert.match(
      sql,
      new RegExp(
        `daily_sessions\\.${actor}_by_member_id = corrections\\.member_id[\\s\\S]*daily_sessions\\.${actor}_by_display_name = corrections\\.old_display_name`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(`${actor}_by_display_name = corrections\\.new_display_name`, "i"),
    );
  }
});

test("prepared sessions allow only observed quantity corrections", () => {
  assert.match(
    sql,
    /if target_session_prepared_at is not null[\s\S]*and p_action <> ''set_observed_quantity''[\s\S]*then/i,
  );
  assert.match(sql, /daily_item_prepared_guard_not_found/i);
  assert.doesNotMatch(sql, /set_prepared''|set_deferred''/i);
  assert.match(
    sql,
    /update_daily_item\(uuid,uuid,date,uuid,integer,text,jsonb\)/i,
  );
});
