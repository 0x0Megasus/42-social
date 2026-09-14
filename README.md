# 42·social

Campus network for 42 / 1337 students. Next.js 16 (App Router) + React 19 + Firebase RTDB.

## Quickstart

```bash
npm install
cp .env.example .env.local  # fill FIREBASE_*, AUTH_SECRET, 42 OAuth
npm run dev
```

Required env: `FIREBASE_DATABASE_URL`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `AUTH_SECRET`.
The server fails closed without them — no silent local fallback.

Support/moderation: set `SUPPORT_IDENTIFIERS` to a comma-separated list of
emails, 42 logins, or user ids (e.g. `SUPPORT_IDENTIFIERS="you@gmail.com"`).
It is read server-side only and never ships to the browser. Listed accounts
can delete any post and get a Support badge. See `.env.local.example`.

## Scripts

| Script | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (Next core-web-vitals + TS) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (`src/lib/__tests__`) |

## Architecture

- `src/app/` — App Router pages (`force-dynamic` feed), API routes under `src/app/api/`.
- `src/components/` — client islands (`Feed`, `PostCard`, `Composer`, `Navbar`).
- `src/lib/` — server core: `db.ts` (RTDB root transaction), `session.ts` (JOSE HS256, iss/aud), `ratelimit.ts` (in-memory sliding window), `feed-rank.ts` (HN-gravity + affinity + diversity), `contracts.ts` (shared API types), `http.ts` (JSON envelopes), `api.ts` (timeout-guarded client fetch).
- Auth gate: `src/proxy.ts` (JWT verify, `/login` + `/api/auth/*` public).

## API contracts

Success: data object. Failure: `{ error: code, retryAfter? }` with `Retry-After` + `X-RateLimit-*` on 429.
See `src/lib/contracts.ts`. Key codes: `unauthorized`, `empty`, `limit`, `duplicate`, `not_found`, `forbidden`, `invalid`.

## Upgrades applied (skill sweep)

- **React/Next perf** (`react-best-practices`, `nextjs-app-router-patterns`): feed enrichment is single-pass `O(P+L+C)` with `Set` liked-lookup (was `O(P×L)` `.some` in a map); immutable `toSorted`; all client polling via timeout-guarded `api()`.
- **Types** (`typescript-pro`): `ES2022` target, shared `contracts.ts`, no duplicated `FeedPost` drift.
- **Backend** (`api-design-principles`, `nodejs-backend-patterns`): `http.ts` envelopes, `rateLimitInfo()` for standard headers, `Cache-Control: no-store` on feed GET, `crypto.randomUUID` ids, JWT issuer/audience with backward-compatible verify.
- **Design/a11y** (`frontend-design`, `tailwind-design-system`, `wcag-audit-patterns`): `@theme` brand tokens, no raw-hex inputs (light mode works), skip link + `#main`, `aria-current`, badge `aria-label`s with `aria-hidden` counts, `role=menu` with `aria-haspopup/controls` + Escape, `prefers-reduced-motion` guard, `richColors` toasts.
- **QA** (`tdd-workflows`): Vitest unit tests for `sanitize`, `feed-rank`, `ratelimit`.

## Production notes

- `ratelimit.ts` is single-process memory. For multi-instance, move to Redis (keys + windows already isolated per feature).
- `db.ts` reads/transacts the RTDB root. It is correct but chatty at scale — next step is per-collection reads (`/posts`, `/likes`) with indexed queries + pagination cursors.
- Feed is `no-store` by design (personalized ranking). Add CDN caching only for public/unauthenticated surfaces.
