# Phase 0 — Field-Length Limits

**Status:** Code changes complete. Migration generation + DB update pending (must run on a machine with `dotnet` CLI).

## What changed

`[MaxLength]`, `[Required]`, `[EmailAddress]`, `[Phone]` data annotations have been added to the string properties on:

- `Models/AppUser.cs` — FirstName (50), LastName (80)
- `Models/Client.cs` — FirstName (50), LastName (80), Email (254), Phone (20)
- `Models/Practice.cs` — Name (120), Slug (80), AdminEmail (254), Phone (20), Address (200), AddressLine1 (100), City (60), State (50), PostalCode (20), Website (500), LogoUrl (500), BannerColor (20), TimeZone (60)
- `Models/Provider.cs` — DisplayName (80), FirstName (50), LastName (80), Email (254), Phone (20), Description (2000)
- `Models/Appointment.cs` — Notes (2000), CancellationToken (64)
- `Models/AppointmentType.cs` — Name (100), Description (500)
- `Models/NotificationSettings.cs` — FromEmail (254), FromName (80)
- `Models/AvailabilityAlert.cs` — ClientName (130), Email (254), Phone (20)
- `Models/PracticeHoliday.cs` — Name (120)
- `Models/ProviderException.cs` — Reason (200)
- `Models/PracticeForm.cs` — Name (120). `FieldsJson` intentionally left as `nvarchar(max)`.

Lengths come from ADR-001 §6 and reflect: RFC 5321 cap on email (254), USPS/international tolerance on address fields, generous bio/notes (2000), and tight slugs/colors/timezone strings.

JSON columns (`FieldsJson`, `ResponsesJson`, `PreferencesJson`) are deliberately uncapped — they need `nvarchar(max)` to hold variable-length form definitions and responses.

`IntakeFormField` (the value object inside `FieldsJson`) is intentionally not annotated — it serializes into `nvarchar(max)` and will be replaced by the new versioned `Field` value object in Phase 2.

## What you need to run

The dev sandbox doesn't have the `dotnet` CLI, so the EF migration wasn't generated automatically. Run these on your local machine from the `ProScheduleAPI/` directory:

```powershell
cd "C:\Users\jwgib\source\repos\Schedule App\ProScheduleAPI"

# Generate the migration. EF will diff the new annotations against the
# current model snapshot and produce AlterColumn calls for each property
# whose column type changed from nvarchar(max) to nvarchar(N).
dotnet ef migrations add AddFieldLengthLimits

# Apply the migration to your local database.
dotnet ef database update
```

If `dotnet ef` complains about not being installed:

```powershell
dotnet tool install --global dotnet-ef
```

The auto-migrate-on-startup logic in `Program.cs` (lines 148-153, dev-only) means once the migration files are committed, they'll apply automatically on next API run in development. So you can skip `dotnet ef database update` if you'd rather just `dotnet run` and let it migrate.

## Pre-flight check before running

The migration will issue `ALTER COLUMN nvarchar(N)` for each property. SQL Server will reject the alter if any existing row has a value longer than `N`. If your dev database has test data with very long values (e.g., a 300-char practice name from a copy-paste mistake), the migration will fail.

Run this query first to find offenders:

```sql
-- Run against your local Scheduler DB
SELECT 'Practices.Name'    AS Field, MAX(LEN(Name))    AS MaxLen FROM Practices    WHERE LEN(Name) > 120
UNION ALL
SELECT 'Practices.Slug',           MAX(LEN(Slug))           FROM Practices    WHERE LEN(Slug) > 80
UNION ALL
SELECT 'Practices.AdminEmail',     MAX(LEN(AdminEmail))     FROM Practices    WHERE LEN(AdminEmail) > 254
UNION ALL
SELECT 'Clients.FirstName',        MAX(LEN(FirstName))      FROM Clients      WHERE LEN(FirstName) > 50
UNION ALL
SELECT 'Clients.LastName',         MAX(LEN(LastName))       FROM Clients      WHERE LEN(LastName) > 80
UNION ALL
SELECT 'Clients.Email',            MAX(LEN(Email))          FROM Clients      WHERE LEN(Email) > 254
UNION ALL
SELECT 'Providers.DisplayName',    MAX(LEN(DisplayName))    FROM Providers    WHERE LEN(DisplayName) > 80
UNION ALL
SELECT 'Providers.Description',    MAX(LEN(Description))    FROM Providers    WHERE LEN(Description) > 2000
UNION ALL
SELECT 'Appointments.Notes',       MAX(LEN(Notes))          FROM Appointments WHERE LEN(Notes) > 2000;
```

Empty result = safe to migrate. Any rows = trim or fix the data first, then re-run.

## Angular client-side validation

Reactive-form validators on the corresponding fields have been mirrored to match the server caps — see the next section of the change set. Server is the source of truth; client validators just give the user inline feedback.

## Roll-back

If something goes wrong:

```powershell
dotnet ef database update <previous-migration-name>
dotnet ef migrations remove
```

(Then revert the entity-file changes from git.)
