import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260717180000_create_applications_and_notifications.sql",
  import.meta.url,
);
const checklistFixUrl = new URL(
  "../supabase/migrations/20260717181000_fix_checklist_validation_lint.sql",
  import.meta.url,
);
const opportunityPolicyFixUrl = new URL(
  "../supabase/migrations/20260717181500_fix_tracked_opportunity_policy_recursion.sql",
  import.meta.url,
);

describe("applications and notifications migration security contract", () => {
  it("creates the approved enums, constraints, indexes and restricted opportunity foreign key", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    for (const status of [
      "planning", "preparing", "submitted", "under_review",
      "shortlisted", "accepted", "rejected", "withdrawn",
    ]) expect(sql).toContain(`'${status}'`);
    expect(sql).toContain("constraint applications_user_opportunity_unique unique (user_id, opportunity_id)");
    expect(sql).toContain("references public.opportunities (id) on delete restrict");
    expect(sql).toContain("applications_user_updated_idx");
    expect(sql).toContain("notifications_user_dedupe_unique unique (user_id, dedupe_key)");
  });

  it("validates checklist structure, size, unique UUIDs and completion state in PostgreSQL", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    const fixSql = await readFile(fileURLToPath(checklistFixUrl), "utf8");
    expect(sql).toContain("create function public.application_checklist_is_valid");
    expect(sql).toContain("jsonb_array_length(checklist_value) > 25");
    expect(sql).toContain("octet_length(checklist_value::text) > 20000");
    expect(sql).toContain("checklist_id = any (seen_ids)");
    expect(sql).toContain("completedAt");
    expect(fixSql).toContain("seen_ids text[] := array[]::text[]");
    expect(fixSql).toContain("stable");
  });

  it("manages lifecycle timestamps and status transitions in PostgreSQL", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("create function public.application_status_transition_is_valid");
    expect(sql).toContain("create trigger applications_set_derived_fields");
    expect(sql).toContain("new.submitted_at := coalesce(new.submitted_at, now())");
    expect(sql).toContain("new.submitted_at := old.submitted_at");
    expect(sql).toContain("previous_status in ('accepted', 'rejected') and next_status = 'under_review'");
  });

  it("forces application RLS and protects managed columns", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("alter table public.applications enable row level security");
    expect(sql).toContain("alter table public.applications force row level security");
    expect(sql).toContain("revoke all on table public.applications from anon");
    expect(sql).toContain("(select auth.uid()) = user_id");
    const updateGrant = sql.match(/grant update \(([^)]*)\)\s+on table public\.applications/)?.[1];
    expect(updateGrant).not.toMatch(/id|user_id|opportunity_id|submitted_at|status_updated_at|created_at|updated_at/);
  });

  it("allows only published, application-owned or saved-owned opportunities without a permissive fallback", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    const fixSql = await readFile(fileURLToPath(opportunityPolicyFixUrl), "utf8");
    expect(fixSql).toContain("create policy \"Users can read published or tracked opportunities\"");
    expect(fixSql).toContain("status = 'published'");
    expect(fixSql).toContain("or public.user_owns_application_for_opportunity(id)");
    expect(fixSql).toContain("or public.user_owns_saved_opportunity(id)");
    expect(fixSql).toMatch(/from public\.applications[\s\S]*applications\.user_id = auth\.uid\(\)/);
    expect(fixSql).toMatch(/from public\.saved_opportunities[\s\S]*saved_opportunities\.user_id = auth\.uid\(\)/);
    expect(fixSql).toContain("security definer");
    expect(fixSql).toContain("set search_path = ''");
    expect(sql + fixSql).not.toMatch(/using \(true\)/i);
  });

  it("denies direct notification inserts and protects all content columns", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("revoke all on table public.notifications from authenticated");
    expect(sql).toContain("grant update (read_at, dismissed_at)");
    expect(sql).not.toMatch(/grant insert[^;]*public\.notifications[^;]*authenticated/i);
    expect(sql).not.toMatch(/grant delete[^;]*public\.notifications[^;]*authenticated/i);
  });

  it("hardens the parameterless synchronization function", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("create function public.sync_my_deadline_notifications()");
    expect(sql).toContain("returns void");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("current_user_id uuid := auth.uid()");
    expect(sql).toContain("applications.user_id = current_user_id");
    expect(sql).toContain("revoke all on function public.sync_my_deadline_notifications() from public");
    expect(sql).toContain("revoke all on function public.sync_my_deadline_notifications() from anon");
    expect(sql).toContain("grant execute on function public.sync_my_deadline_notifications() to authenticated");
  });

  it("uses non-overlapping deadline bands and ignores rolling, expired and terminal applications", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    for (const window of ["1 day", "3 days", "7 days", "30 days"]) {
      expect(sql).toContain(`interval '${window}'`);
    }
    expect(sql).toContain("applications.status not in ('accepted', 'rejected', 'withdrawn')");
    expect(sql).toContain("opportunities.deadline is not null");
    expect(sql).toContain("opportunities.deadline > pg_catalog.now()");
    expect(sql).toContain("on conflict (user_id, dedupe_key) do nothing");
  });

  it("contains no service-role or secret-key reference", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).not.toMatch(/service[_-]?role|secret[_-]?key/i);
  });
});
