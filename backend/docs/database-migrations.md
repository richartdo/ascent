# Database migration guide

## Layout and environments

Ordered SQL migrations live in `backend/supabase/migrations`. They create profiles, opportunities, saved opportunities, applications, notifications, functions, RLS policies, and the initial verified opportunity records. Seed opportunities are migration-controlled; the separate Supabase seed-file feature is disabled.

Use distinct Supabase projects for development, UAT, and production. Link and verify the target every time—migration history is per project. This backend uses the publishable key plus user JWTs and requires no service-role key.

## CLI workflow

From `backend/`:

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref YOUR_PROJECT_ID
pnpm dlx supabase migration list
pnpm dlx supabase db push --dry-run
pnpm dlx supabase db push
pnpm dlx supabase migration list
pnpm dlx supabase db lint --linked
```

`migration list` compares local and remote history. `db push --dry-run` previews pending migrations without applying them. Review the exact project reference and SQL before `db push`. The final list should show matching local and remote versions; lint should report no actionable database errors.

If `supabase/config.toml` is missing in a new project, `pnpm dlx supabase init` creates it. This repository already includes the configuration, so do not reinitialize it.

## RLS verification

Use ordinary test users and their access tokens:

1. Confirm anonymous selects/inserts/updates/deletes are denied.
2. Confirm each user can access only their profile, saved opportunities, applications, and notifications.
3. Confirm cross-user UUID requests reveal no records.
4. Confirm authenticated users cannot mutate opportunities.
5. Confirm users cannot insert notifications or alter managed columns.
6. Confirm only published or user-tracked opportunities are visible.

Run the offline migration contract tests with `pnpm test`. For linked verification, use the Supabase SQL editor/policy view and user-scoped API requests; never bypass RLS with service-role credentials.

## Production safety

- Never run `db reset --linked` against production.
- Never commit or paste a database password, access token, or service-role key.
- Never assume the currently linked project; verify its reference and migration history.
- Never edit an applied migration to change production history. Add a narrowly scoped forward migration after review.
- Back up production and obtain explicit approval before applying migrations.
- Phase 7A performs no remote migration or database write.
