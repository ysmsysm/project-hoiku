import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260719000100_expand_daily_sharing_schema.sql";
const sql = readFileSync(migrationPath, "utf8");
const memberFkRepairMigrationPath =
  "supabase/migrations/20260719000200_fix_daily_member_fk_delete_behavior.sql";
const memberFkRepairSql = readFileSync(memberFkRepairMigrationPath, "utf8");
const initialMigrationSql = readFileSync(
  "supabase/migrations/20260711000100_create_family_sharing_schema.sql",
  "utf8",
);

const memberFkRepairs = [
  {
    table: "daily_sessions",
    constraint: "daily_sessions_checked_member_family_fk",
    memberColumn: "checked_by_member_id",
  },
  {
    table: "daily_sessions",
    constraint: "daily_sessions_prepared_member_family_fk",
    memberColumn: "prepared_by_member_id",
  },
  {
    table: "daily_sessions",
    constraint: "daily_sessions_thanks_sent_member_family_fk",
    memberColumn: "thanks_sent_by_member_id",
  },
  {
    table: "daily_sessions",
    constraint: "daily_sessions_thanks_received_member_family_fk",
    memberColumn: "thanks_received_by_member_id",
  },
  {
    table: "daily_items",
    constraint: "daily_items_updated_member_family_fk",
    memberColumn: "updated_by_member_id",
  },
] as const;

const getConstraintRepairSql = (constraintName: string) => {
  const dropStart = memberFkRepairSql.indexOf(
    `drop constraint if exists ${constraintName}`,
  );
  assert.ok(dropStart >= 0, `missing drop for ${constraintName}`);

  const nextDropStart = memberFkRepairSql.indexOf(
    "drop constraint if exists",
    dropStart + 1,
  );
  return memberFkRepairSql.slice(
    dropStart,
    nextDropStart === -1 ? memberFkRepairSql.indexOf("commit;", dropStart) : nextDropStart,
  );
};

test("daily sharing schema migrations are present and add no RPCs", () => {
  const migrations = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql"),
  );

  assert.ok(migrations.includes("20260719000100_expand_daily_sharing_schema.sql"));
  assert.ok(
    migrations.includes("20260719000200_fix_daily_member_fk_delete_behavior.sql"),
  );
  assert.equal(
    migrations.filter((file) => file.includes("expand_daily_sharing_schema"))
      .length,
    1,
  );
  assert.equal(
    migrations.filter((file) =>
      file.includes("fix_daily_member_fk_delete_behavior"),
    ).length,
    1,
  );
  assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(
    memberFkRepairSql,
    /create\s+(or\s+replace\s+)?function/i,
  );
  assert.doesNotMatch(sql, /app\/HomeClient|src\/lib\/storage|repository/i);
  assert.doesNotMatch(
    memberFkRepairSql,
    /app\/HomeClient|src\/lib\/storage|repository/i,
  );
});

test("daily sessions receive version, actor snapshots, and thanks columns", () => {
  assert.match(sql, /alter table public\.daily_sessions[\s\S]*checked_by_user_id uuid/i);
  assert.match(sql, /checked_by_display_name text/i);
  assert.match(sql, /prepared_by_user_id uuid/i);
  assert.match(sql, /prepared_by_display_name text/i);
  assert.match(sql, /thanks_sent_at timestamptz/i);
  assert.match(sql, /thanks_sent_by_member_id uuid/i);
  assert.match(sql, /thanks_sent_by_user_id uuid/i);
  assert.match(sql, /thanks_sent_by_display_name text/i);
  assert.match(sql, /thanks_received_by_member_id uuid/i);
  assert.match(sql, /thanks_received_by_user_id uuid/i);
  assert.match(sql, /thanks_received_by_display_name text/i);
  assert.match(sql, /add column if not exists version integer/i);
  assert.match(sql, /alter column version set default 1/i);
  assert.match(sql, /alter column version set not null/i);
  assert.match(sql, /daily_sessions_version_positive_check/i);
});

test("daily items receive quantity, carryover, soft delete, actor, and version columns", () => {
  assert.match(sql, /alter table public\.daily_items[\s\S]*required_quantity integer/i);
  assert.match(sql, /observed_quantity integer/i);
  assert.match(sql, /shortage_count integer/i);
  assert.match(sql, /carryover_pending_shortage_count integer/i);
  assert.match(sql, /is_carryover boolean/i);
  assert.match(sql, /carried_from_daily_item_id uuid/i);
  assert.match(sql, /carryover_processed_at timestamptz/i);
  assert.match(sql, /carryover_resolved_at timestamptz/i);
  assert.match(sql, /deleted_at timestamptz/i);
  assert.match(sql, /updated_by_member_id uuid/i);
  assert.match(sql, /updated_by_user_id uuid/i);
  assert.match(sql, /updated_by_display_name text/i);
  assert.match(sql, /required_quantity = coalesce\(required_quantity, quantity\)/i);
  assert.match(sql, /alter column required_quantity set not null/i);
  assert.match(sql, /alter column is_carryover set not null/i);
  assert.match(sql, /alter column version set not null/i);
});

test("daily sharing constraints cover kind, counts, ad hoc shape, and regular-only observed quantities", () => {
  assert.match(sql, /daily_items_kind_daily_sharing_check/i);
  assert.match(sql, /kind in \('regular', 'spot', 'rough'\)/i);
  assert.match(sql, /daily_items_daily_sharing_counts_check/i);
  assert.match(sql, /required_quantity >= 0/i);
  assert.match(sql, /observed_quantity is null or observed_quantity >= 0/i);
  assert.match(sql, /shortage_count is null or shortage_count >= 0/i);
  assert.match(
    sql,
    /carryover_pending_shortage_count is null[\s\S]*or carryover_pending_shortage_count >= 0/i,
  );
  assert.match(sql, /version >= 1/i);
  assert.match(sql, /daily_items_ad_hoc_spot_shape_check/i);
  assert.match(sql, /is_ad_hoc = false[\s\S]*kind = 'spot'[\s\S]*item_template_id is null/i);
  assert.match(sql, /daily_items_non_regular_observed_empty_check/i);
  assert.match(
    sql,
    /kind = 'regular'[\s\S]*observed_quantity is null[\s\S]*carryover_pending_shortage_count is null/i,
  );
});

test("daily sharing uniqueness and indexes prevent duplicate permanent and ad hoc carryover rows", () => {
  assert.match(
    sql,
    /create unique index if not exists daily_items_one_template_per_session_active_idx[\s\S]*on public\.daily_items\(daily_session_id, item_template_id\)[\s\S]*where item_template_id is not null[\s\S]*and deleted_at is null/i,
  );
  assert.match(
    sql,
    /create unique index if not exists daily_items_one_ad_hoc_carryover_source_per_session_idx[\s\S]*on public\.daily_items\(daily_session_id, carried_from_daily_item_id\)[\s\S]*where is_ad_hoc = true[\s\S]*carried_from_daily_item_id is not null[\s\S]*deleted_at is null/i,
  );
  assert.match(sql, /create index if not exists daily_items_carried_from_idx/i);
  assert.match(sql, /create index if not exists daily_items_session_kind_idx/i);
  assert.match(sql, /create index if not exists daily_items_family_updated_at_idx/i);
  assert.match(sql, /create index if not exists daily_items_carryover_source_idx/i);
  assert.match(initialMigrationSql, /create index daily_items_template_idx/i);
});

test("member and carryover foreign keys preserve daily history on deletion", () => {
  assert.match(
    sql,
    /drop constraint daily_sessions_checked_member_family_fk[\s\S]*add constraint daily_sessions_checked_member_family_fk[\s\S]*references public\.family_members\(id, family_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /drop constraint daily_sessions_prepared_member_family_fk[\s\S]*add constraint daily_sessions_prepared_member_family_fk[\s\S]*references public\.family_members\(id, family_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /daily_sessions_thanks_sent_member_family_fk[\s\S]*references public\.family_members\(id, family_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /daily_sessions_thanks_received_member_family_fk[\s\S]*references public\.family_members\(id, family_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /daily_items_updated_member_family_fk[\s\S]*references public\.family_members\(id, family_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    sql,
    /daily_items_carried_from_daily_item_fk[\s\S]*references public\.daily_items\(id\)[\s\S]*on delete set null/i,
  );
  assert.doesNotMatch(sql, /references auth\.users/i);
});

test("member foreign key repair sets only nullable member id columns to null", () => {
  for (const { table, constraint, memberColumn } of memberFkRepairs) {
    const constraintSql = getConstraintRepairSql(constraint);

    assert.match(
      memberFkRepairSql,
      new RegExp(`alter table public\\.${table}\\s+drop constraint if exists ${constraint}`, "i"),
    );
    assert.match(
      constraintSql,
      new RegExp(`drop constraint if exists ${constraint}`, "i"),
    );
    assert.match(
      constraintSql,
      new RegExp(`add constraint ${constraint}[\\s\\S]*foreign key \\(${memberColumn}, family_id\\)`, "i"),
    );
    assert.match(
      constraintSql,
      new RegExp(`references public\\.family_members\\(id, family_id\\)[\\s\\S]*on delete set null \\(${memberColumn}\\)`, "i"),
    );
    assert.doesNotMatch(
      constraintSql,
      /on delete set null \(family_id\)|on delete set null \([^)]*family_id[^)]*\)/i,
    );
  }
});

test("member foreign key repair keeps RLS, RPCs, and app code untouched", () => {
  assert.doesNotMatch(
    memberFkRepairSql,
    /create policy|drop policy|alter table public\.daily_sessions disable row level security|alter table public\.daily_items disable row level security/i,
  );
  assert.doesNotMatch(memberFkRepairSql, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(
    memberFkRepairSql,
    /HomeClient\.tsx|app\/page|src\/lib\/storage|repository|package\.json/i,
  );
});

test("updated_at triggers are reused without duplicating existing trigger names", () => {
  assert.match(initialMigrationSql, /create or replace function public\.set_updated_at/i);
  assert.match(sql, /tgname = 'daily_sessions_set_updated_at'/i);
  assert.match(sql, /tgname = 'daily_items_set_updated_at'/i);
  assert.match(
    sql,
    /create trigger daily_sessions_set_updated_at[\s\S]*execute function public\.set_updated_at\(\)/i,
  );
  assert.match(
    sql,
    /create trigger daily_items_set_updated_at[\s\S]*execute function public\.set_updated_at\(\)/i,
  );
});

test("existing daily RLS policies remain the family-member based access model", () => {
  assert.match(
    initialMigrationSql,
    /create policy daily_sessions_select_family_members[\s\S]*using \(public\.is_family_member\(family_id\)\)/i,
  );
  assert.match(
    initialMigrationSql,
    /create policy daily_items_update_family_members[\s\S]*with check \(public\.is_family_member\(family_id\)\)/i,
  );
  assert.doesNotMatch(sql, /create policy|drop policy|alter table public\.daily_sessions disable row level security|alter table public\.daily_items disable row level security/i);
});
