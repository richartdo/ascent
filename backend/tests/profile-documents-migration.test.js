import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260721140000_create_private_profile_documents.sql",
  import.meta.url,
);

describe("private profile document storage migration", () => {
  it("creates a private, size-limited document bucket", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

    expect(sql).toContain("'profile-documents'");
    expect(sql).toMatch(/'profile-documents',\s*false,\s*5242880/);
    expect(sql).toContain("'application/pdf'");
    expect(sql).toContain("'application/msword'");
    expect(sql).toContain("'application/vnd.openxmlformats-officedocument.wordprocessingml.document'");
  });

  it("restricts reads, uploads, and deletes to the authenticated user's folder", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

    expect(sql.match(/bucket_id = 'profile-documents'/g)).toHaveLength(3);
    expect(sql.match(/storage\.foldername\(name\)/g)).toHaveLength(3);
    expect(sql.match(/auth\.uid\(\)::text/g)).toHaveLength(3);
    expect(sql).not.toMatch(/to anon|service[_-]?role|using \(true\)|with check \(true\)/i);
  });
});
