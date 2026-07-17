import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260717140000_create_profiles.sql",
  import.meta.url,
);

describe("profiles migration security contract", () => {
  it("enables RLS and binds every profile write policy to auth.uid()", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

    expect(sql).toContain("alter table public.profiles enable row level security");
    expect(sql).toContain("alter table public.profiles force row level security");
    expect(sql).toContain("revoke all on table public.profiles from anon");
    expect(sql).toContain("revoke all on table public.profiles from authenticated");
    expect(sql).toContain("create trigger profiles_set_derived_fields");
    expect(sql).not.toMatch(/grant update \([\s\S]*profile_completion/);
    expect(sql).toContain("with check ((select auth.uid()) = id)");
    expect(sql).not.toMatch(/service[_-]?role/i);
    expect(sql).not.toMatch(/for delete/i);
  });
});
