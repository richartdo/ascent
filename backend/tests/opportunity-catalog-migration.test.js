import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260721130000_expand_verified_opportunity_catalog.sql",
  import.meta.url,
);

const existingCounts = {
  scholarship: 3,
  internship: 1,
  job: 1,
  grant: 1,
  fellowship: 0,
  competition: 1,
  accelerator: 1,
  hackathon: 0,
  training: 0,
};

async function readCatalog() {
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const payload = sql.match(/\$catalog\$\s*([\s\S]*?)\s*\$catalog\$/)?.[1];
  return { sql, catalog: JSON.parse(payload) };
}

describe("expanded verified opportunity catalog migration", () => {
  it("brings every supported opportunity type to exactly ten records", async () => {
    const { catalog } = await readCatalog();
    const addedCounts = Object.groupBy(catalog, ({ type }) => type);

    expect(catalog).toHaveLength(82);
    for (const [type, existingCount] of Object.entries(existingCounts)) {
      expect(existingCount + (addedCounts[type]?.length ?? 0)).toBe(10);
    }
  });

  it("uses deterministic unique identities and canonical organizer URLs", async () => {
    const { sql, catalog } = await readCatalog();

    expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
    expect(new Set(catalog.map(({ url }) => url)).size).toBe(catalog.length);
    expect(catalog.every(({ url }) => /^https:\/\//.test(url))).toBe(true);
    expect(sql).toContain("on conflict (canonical_url) do nothing");
    expect(sql).not.toMatch(/service[_-]?role|example\.(com|org)/i);
  });

  it("contains no fixed deadline that had passed on the verification date", async () => {
    const { catalog } = await readCatalog();
    const verificationInstant = Date.parse("2026-07-21T00:00:00Z");

    for (const opportunity of catalog) {
      if (opportunity.deadline !== null) {
        expect(Date.parse(opportunity.deadline)).toBeGreaterThan(verificationInstant);
      }
    }
  });
});
