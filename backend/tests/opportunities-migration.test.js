import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../supabase/migrations/20260717160000_create_opportunities_and_saved.sql", import.meta.url);
const seedUrl = new URL("../supabase/migrations/20260717161000_seed_opportunities.sql", import.meta.url);

describe("opportunities migration security contract", () => {
  it("enforces published opportunity reads and prevents authenticated mutations", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("alter table public.opportunities enable row level security");
    expect(sql).toContain("alter table public.opportunities force row level security");
    expect(sql).toContain("revoke all on table public.opportunities from anon");
    expect(sql).toContain("grant select on table public.opportunities to authenticated");
    expect(sql).toContain("using (status = 'published')");
    expect(sql).not.toMatch(/grant (insert|update|delete).*public\.opportunities.*authenticated/i);
  });

  it("binds saved records to auth.uid and published referenced records", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toMatch(/for insert[\s\S]*exists \([\s\S]*opportunities\.status = 'published'/);
    expect(sql).toContain("grant update (notes)");
    const updateGrant = sql.match(/grant update \(([^)]*)\) on table public\.saved_opportunities/)?.[1];
    expect(updateGrant?.trim()).toBe("notes");
    expect(sql).not.toMatch(/service[_-]?role/i);
  });

  it("uses canonical URLs for uniqueness and permits shared source URLs", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
    expect(sql).toContain("opportunities_canonical_url_unique unique (canonical_url)");
    expect(sql).not.toMatch(/unique \(source_url\)/);
    expect(sql).toContain("is_global boolean not null default false");
  });

  it("contains eight deterministic, officially sourced seed records with verification dates", async () => {
    const sql = await readFile(fileURLToPath(seedUrl), "utf8");
    expect(sql.match(/'10000000-0000-4000-8000-00000000000\d'/g)).toHaveLength(8);
    expect(sql.match(/'2026-07-17T12:00:00Z'/g)).toHaveLength(16);
    expect(sql).not.toMatch(/example\.(com|org)/i);
  });
});
