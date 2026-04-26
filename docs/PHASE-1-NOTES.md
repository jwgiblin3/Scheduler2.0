# Phase 1 — SuperAdmin Role + Admin Shell

**Status:** Code changes complete. One EF migration + one CLI invocation pending.

## What changed

**Backend**

- `Models/AppUser.cs`
  - Added `UserRole.SuperAdmin = -1` to the enum.
  - Implemented `IValidatableObject` enforcing the invariant *SuperAdmin → PracticeId is null*.
- `Data/AppDbContext.cs`
  - Added a DB-level CHECK constraint mirroring the same invariant: `([Role] <> -1) OR ([PracticeId] IS NULL)`. Belt and suspenders so direct SQL inserts can't bypass the rule either.
- `Program.cs`
  - Authorization policies registered: `SuperAdmin`, `PracticeAdmin` (accepts SuperAdmin OR Admin), `ManageGlobals` (SuperAdmin only).
  - CLI dispatch hook before `app.Run()` — when `args[0] == "seed-superadmin"`, invokes `SuperAdminSeeder.RunAsync` and exits with the seeder's status code.
- `Services/SuperAdminSeeder.cs` (new)
  - Reads `--email` and `--password` from args.
  - Refuses if any SuperAdmin already exists (so the CLI is *bootstrap only* — additional SuperAdmins must come through the audited admin UI in Phase 3).
  - Refuses if the email is already taken by another account.
  - On success, creates the user via `UserManager.CreateAsync` with `Role = SuperAdmin`, `PracticeId = null`, `EmailConfirmed = true`.

**Frontend**

- `core/services/auth.service.ts`
  - Added `isSuperAdmin()` helper.
  - `postLoginRoute()` now sends a SuperAdmin to `/admin` after sign-in.
- `core/guards/auth.guard.ts`
  - Added `superAdminGuard`. Bounces non-SuperAdmin signed-in users to `/dashboard`, anonymous users to `/login`.
- `features/admin/admin-home.component.{ts,html,scss}` (new)
  - Minimal shell page for the SuperAdmin Console.
  - Visually distinct from the practice dashboard (dark header, "SuperAdmin" badge) so it's obvious which side of the app the user is on.
  - Five placeholder tiles for the Phase 3 screens: Form Templates, Field Groups, Practices, Admin Users, Audit Log. They're intentionally non-clickable and styled muted/dashed so SuperAdmins know they're not built yet.
- `app.routes.ts`
  - New route `/admin` (lazy-loaded) gated by `superAdminGuard`.

## What you need to run

### 1. Generate and apply the migration

The Phase 1 schema change is just the new CHECK constraint on `AspNetUsers`. From PowerShell in the API folder:

```powershell
cd "C:\Users\jwgib\source\repos\Schedule App\ProScheduleAPI"
dotnet ef migrations add AddSuperAdminRoleAndConstraint
dotnet ef database update
```

(Or just `dotnet run` after `migrations add` — the dev-only auto-migrate block in `Program.cs` will apply it on next API start.)

If existing data has any AspNetUsers row with `Role = -1` AND `PracticeId IS NOT NULL`, the migration will fail when SQL Server tries to enable the CHECK. There shouldn't be any (we just introduced `SuperAdmin = -1` in this phase), but if there is, fix the row first.

### 2. Bootstrap the first SuperAdmin

After the migration applies:

```powershell
cd "C:\Users\jwgib\source\repos\Schedule App\ProScheduleAPI"
dotnet run -- seed-superadmin --email you@example.com --password "YourStrongPassword123"
```

Note the `--` between `dotnet run` and the seed command — that tells `dotnet run` everything after is for the application, not for itself.

Password rules from `Program.cs` Identity options: ≥ 8 chars, must contain a digit. No uppercase or non-alphanumeric required.

The process will print `[seed-superadmin] Created SuperAdmin '<email>' (id=N).` on success and exit 0. Run the command again and it'll refuse — that's the "bootstrap only" guard.

### 3. Sign in

Restart the API normally (`dotnet run` with no args), then in the Angular UI sign in with the SuperAdmin email + password. The `postLoginRoute()` logic routes you straight to `/admin`. You'll see the Console shell with five Phase 3 placeholder tiles.

## Verifying the SuperAdmin invariant

Try this from SSMS or your favorite SQL client to confirm the CHECK works:

```sql
-- Should fail with a check-constraint violation:
UPDATE dbo.AspNetUsers
SET Role = -1, PracticeId = 1
WHERE Email = 'someone@example.com';
-- Msg 547: The UPDATE statement conflicted with the CHECK constraint
-- "CK_AspNetUsers_SuperAdmin_NoPracticeId".
```

And the API-level invariant — POSTing a user with `Role: "SuperAdmin"` and a `PracticeId` set will return a 400 from `AppUser.Validate()` before the DB rejects it. Friendlier error than the SQL exception.

## What's NOT in Phase 1

- The actual screens behind the Phase 3 tiles. They're placeholders — clicking them does nothing.
- Bulk import / UI-driven creation of additional SuperAdmins. v1 has only the CLI bootstrap path; Phase 3 adds an admin-managed user CRUD screen.
- Audit logging of SuperAdmin actions. Will land alongside the audit-log table in Phase 2.
- Removing or demoting SuperAdmins. Also Phase 3 admin UI.

## Roll-back

If you decide to back out:

```powershell
dotnet ef database update <previous-migration-name>
dotnet ef migrations remove
```

Then revert the entity / route changes from git. The first SuperAdmin row you seeded will need to be deleted manually from `AspNetUsers` since the rollback drops the constraint but not the row.
