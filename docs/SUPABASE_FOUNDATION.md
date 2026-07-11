# Supabase Foundation

This document records the Supabase foundation added before family sharing is
connected to the app UI.

## Added Files

- `.env.example`
- `src/lib/env.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/types/env.d.ts`
- `supabase/config.toml`
- `supabase/migrations/20260711000100_create_family_sharing_schema.sql`

## Environment Variables

Copy `.env.example` to `.env.local` locally and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not put a service role key, secret key, or any non-public key in browser
code or a `NEXT_PUBLIC_*` variable.

## Local Supabase

The Supabase CLI is intended to be run with `npx` to keep this project change
small:

```bash
npx supabase --version
npx supabase start
```

Docker is required for `supabase start`. It is not required to run the existing
localStorage-only app.

## Migrations

The initial family sharing schema is stored in:

```text
supabase/migrations/20260711000100_create_family_sharing_schema.sql
```

After starting a local Supabase stack, apply migrations with:

```bash
npx supabase db reset
```

For a linked remote project, use the normal Supabase workflow after linking:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

This repository has not been linked to a remote Supabase project, and no remote
database push has been run.

## Current App Connection

The existing app screens are not connected to Supabase yet. `app/page.tsx`,
`appRepository`, `LocalRepository`, and `src/lib/storage.ts` still power the
one-person localStorage mode.

The Supabase client helpers only read environment variables when their
`createClient` functions are called. Existing screens do not call them, so the
one-person app can still open without Supabase environment variables.

## Database Types

Do not hand-write the generated Supabase `Database` type. Generate it from a
real linked database after migrations are applied, for example:

```bash
npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
```

Use the actual command flags required by the linked project and environment.
Do not commit project IDs or secrets.

## Next Step

The next planned engineering step is email OTP authentication. Middleware,
auth callback routes, family creation, invite links, Realtime subscriptions,
and data migration are intentionally not implemented in this foundation step.
