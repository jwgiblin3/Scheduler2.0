# Widget Embedding — Production Deployment Notes

This document covers everything that has to change beyond the code edits I made in order to let third-party practice websites embed the ProSchedule widgets at `/widget/book/:slug` and `/widget/my/appointments` in production.

## 1. Apply the EF migration for `Practice.Website`

I added a nullable `Website` column to the `Practice` model but did **not** generate the migration file (EF tooling isn't available in this sandbox). From the `ProScheduleAPI` folder on a machine with the .NET SDK:

```sh
dotnet ef migrations add AddPracticeWebsite
dotnet ef database update     # or let dev auto-migrate via Program.cs
```

That produces a new migration in `Migrations/` plus an updated `AppDbContextModelSnapshot.cs`. Commit all three files.

## 2. CORS — what changed

`Program.cs` now delegates the CORS origin check to `PracticeCorsOriginProvider`, which merges two sources:

1. **Static origins** — `Cors:AllowedOrigins` in `appsettings*.json`. Use this for the ProSchedule UI itself and any internal/dev hosts.
2. **Dynamic origins** — every non-null `Practice.Website` value in the database, re-read on a short cache TTL (default 60 s, configurable via `Cors:CacheTtlSeconds`). On practice create/update the cache is invalidated immediately via `PracticeCorsOriginProvider.Invalidate()`.

Config keys to set in `appsettings.Production.json`:

```json
"Cors": {
  "AllowedOrigins": [
    "https://app.yourdomain.com"
  ],
  "CacheTtlSeconds": 300
}
```

Keep the static list minimal — it's for the platform's own origins. Practice sites live in the database.

## 3. Turn off `*.AllowAnyHeader` / `AllowAnyMethod` if you need credentials

The widget currently uses a `Bearer` token from `localStorage`, so the iframe's fetch does **not** need `withCredentials: true` and the existing CORS policy works. If you ever switch to cookie-based auth you'll need to add `.AllowCredentials()` to the policy **and** make the origin check strict (wildcards and credentials are mutually exclusive in the CORS spec).

## 4. Allow the page to be framed: `X-Frame-Options` / CSP `frame-ancestors`

By default ASP.NET doesn't set `X-Frame-Options`, but many reverse proxies and static hosts (Azure Static Web Apps, Cloudflare, nginx defaults) inject `X-Frame-Options: DENY` or `SAMEORIGIN`. That blocks iframe embedding.

For the Angular UI (the page that serves `/widget/*`), set **both**:

* Remove or override `X-Frame-Options` (modern browsers prefer CSP anyway — you only need this for legacy IE/older Safari).
* Set `Content-Security-Policy: frame-ancestors 'self' https://*.ridgewoodspine.com https://clinicb.example.com;` — a space-separated list of origins (with optional wildcards in the host component) that are allowed to frame your UI.

Because `frame-ancestors` must also be driven by practice websites, populate it the same way as CORS — read `Practice.Website` values at startup (plus your static list) and emit the header from middleware. You can reuse `PracticeCorsOriginProvider.IsAllowed` but you'll want a variant that returns the full list for the header value rather than a boolean.

If the Angular UI is served by a static host rather than the API, configure the host instead:

* **Azure Static Web Apps** — `staticwebapp.config.json` → `globalHeaders`.
* **Nginx** — `add_header Content-Security-Policy "..."; add_header X-Frame-Options "";` (the empty value effectively unsets it).
* **Cloudflare / Cloudfront** — response headers transform rule.

## 5. HTTPS end-to-end

Browsers block mixed-content iframes (HTTPS page framing HTTP). Both the embedder's site and `https://app.yourdomain.com/widget/*` must be HTTPS, and `environment.ts` already assumes `https://api.yourdomain.com/api`. Double-check the deployed `apiUrl` and that the cert is wildcard or includes every subdomain you serve from.

## 6. Cookie policy (if you add third-party auth cookies later)

If you ever issue an auth cookie from the API, it needs:

* `SameSite=None; Secure` — without `None`, cookies are dropped on cross-site XHR from the iframe.
* The API origin and UI origin must be same-site OR you accept losing some privacy-mode browsers.

Today the widget reads a bearer token from `localStorage` within its own origin (the ProSchedule UI), which sidesteps all third-party cookie restrictions. That's fine for now — noting it because the first question about cookie auth will come up as soon as someone asks "why do users have to sign in inside the iframe?"

## 7. Anti-clickjacking review

`frame-ancestors` restricts who can frame you, but within the widget itself take a quick pass over:

* Any destructive action (cancel appointment, sign-in as someone else) should require a click that can't be spoofed by an invisible iframe overlay. The current buttons are fine — no double-clicks, no drag-drop-to-confirm — but add a confirm dialog to any future "delete account" type action.
* Sensitive routes (`/dashboard`, `/providers`, `/appointment-types`, `/settings`) should **not** be framable. Emit `frame-ancestors 'none'` for those paths and `frame-ancestors <whitelist>` only for `/widget/*`. Easy to do with a path-scoped middleware.

## 8. Rate limiting

The widget's `getPublicPractice(slug)` and `getAvailability` endpoints are public (no auth). In production, put a per-IP rate limit in front of them — ASP.NET Core has built-in `AddRateLimiter`, or terminate at the proxy. Booking endpoints are auth-gated so the blast radius there is just authenticated abuse.

## 9. Embed snippet you can paste into the practice's website

```html
<!-- Booking widget -->
<iframe
  src="https://app.yourdomain.com/widget/book/ridgewood-spine-and-sport"
  style="width:100%; min-height:900px; border:0;"
  title="Book an appointment"
  allow="clipboard-write"
  loading="lazy">
</iframe>

<!-- My Appointments widget -->
<iframe
  src="https://app.yourdomain.com/widget/my/appointments"
  style="width:100%; min-height:600px; border:0;"
  title="My appointments"
  loading="lazy">
</iframe>
```

The widgets are responsive down to ~360 px wide. If the host page is narrow, drop `min-height` and use postMessage-based auto-resize (out of scope for this pass — happy to add `iframe-resizer` wiring next round if you want pixel-perfect fit).

## 10. Quick smoke-test checklist before cutting over

* [ ] `Practice.Website` column exists in production DB (migration applied).
* [ ] Register a practice with `practiceWebsite` set — check the row.
* [ ] From a browser at the practice's origin, fetch `GET /api/public/{slug}` — expect a 200 with proper `Access-Control-Allow-Origin`.
* [ ] Embed `/widget/book/{slug}` in a simple HTML file served from the practice's origin. Book a slot end-to-end.
* [ ] Embed `/widget/my/appointments` signed out — confirm inline sign-in prompt appears and clicking "Sign in" escapes the iframe via `target="_top"`.
* [ ] Sign in, re-open the embed — confirm appointments load.
* [ ] Update the practice's website URL in settings — confirm a fresh fetch from the new origin is allowed within 60 s (or whatever `CacheTtlSeconds` is set to).
* [ ] Watch API logs for 401s on `/api/auth/login` — not related to widgets but the bug that started this conversation.

## 11. Unrelated cleanup on the way

Eight or nine `.ts` / `.html` / `.scss` files under `pryschedule-ui/src/app/features/*` are truncated mid-statement in the current working copy (no trailing newline, ends with partial content). I repaired `booking.component.{ts,html,scss}` because the widget extraction depended on them, but the following are still broken on disk and won't compile until restored from HEAD or re-edited:

* `app.ts`
* `app/features/appointment-types/appointment-types-list.component.ts`
* `app/features/appointments/appointment-detail.component.ts`
* `app/features/appointments/appointments-list.component.ts`
* `app/features/auth/login.component.ts`
* `app/features/booking/booking-confirm.component.ts`
* `app/features/booking/intake-form.component.ts`
* `app/features/dashboard/dashboard.component.ts`
* `app/features/providers/provider-form.component.ts`
* `app/features/providers/providers-list.component.ts`
* `app/features/settings/practice-settings.component.ts`
* `app/shared/components/shell.component.ts`

`git diff HEAD -- <file>` on each shows the tail missing — same pattern. Best to `git restore` them and re-apply whatever change was in flight with a freshly-written full file.
