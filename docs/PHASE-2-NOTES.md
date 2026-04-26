# Phase 2 — Field Groups, Form Templates, Form Instances, Audit Log

**Status:** Code complete. One large EF migration pending. No data backfill in this phase — old `PracticeForm` / `IntakeFormResponse` rows keep working untouched.

## What changed

### New entities (all in `Models/`)

- **`Field`** — POCO embedded inside FieldGroup/FormTemplate JSON. Replaces `IntakeFormField` with: `Type` (17 enum values), `Width` (Full/Half/Third/Quarter), `MaxLength`/`MinLength`/`Pattern`, structured `Options[]`, `PhiFlag`, `ConditionalLogic` (single show-if-equals rule, AND/OR deferred per parking lot #5).
- **`FieldGroup`** + **`FieldGroupVersion`** — reusable Lego blocks ("Contact Information", "Address", "Insurance", "Medical History — Chiropractic", "Medical History — Massage Therapy"). `LogicalId` Guid is the stable identity that survives version edits. Tenancy: global (`IsGlobal=true, OwnerPracticeId=null`), tenant fork (`IsGlobal=false, ParentLogicalId=<global>`), or tenant-only original (`IsGlobal=false, ParentLogicalId=null`). Soft-delete via `DeletedAt`.
- **`FormTemplate`** + **`FormTemplateVersion`** — ordered collections of group references (`{ kind: "group", groupLogicalId, groupVersion }`) and standalone fields (`{ kind: "field", field: {...} }`) serialized in `ItemsJson`. `TargetAudience` tags the vertical ("chiro", "massage", "pt", "generic").
- **`FormInstance`** — a specific filling-out by a client for an appointment. Pins `FormTemplateVersionId` and a `PinnedGroupVersionsJson` map at creation. `Status` walks Pending → InProgress → Submitted (or → Voided). On submit, `Snapshot` is populated with the fully-expanded template+groups so the form renders forever even if its source rows are later soft-deleted. Captures `SubmissionIp` for the e-signature audit trail.
- **`AuditLog`** — append-only access trail per HIPAA Security Rule 45 CFR § 164.312(b). Granularity is the entity, not the field. Captures: timestamp (UTC microsecond), userId/role/IP, action (Read/Create/Update/Delete/Print/Export/Login/FailedLogin/Submit/Void), entity type+id, practice context, list of changed-field-names (never values), optional note. `bigint` PK because this table grows unbounded.

### New service

- **`IAuditService` / `AuditService`** in `Services/`. Reads the current user, role, and IP from `HttpContext` automatically. Tolerant of missing context for pre-auth events. Never throws on failure — logs and swallows DB errors so an audit-write hiccup can't 500 the request that triggered it.

### Wired into

- `Program.cs` registers `IHttpContextAccessor` and `IAuditService` (scoped). Audit service follows the same scoping as DbContext so they share the request lifetime.
- `Controllers/AuthController.cs` now writes `Login` and `FailedLogin` audit events. This is a smoke test of the full audit stack — sign in / fail to sign in, then `SELECT * FROM AuditLogs ORDER BY Id DESC` to see your trail.
- `Data/AppDbContext.cs` adds DbSets and relationship config — see below for the index plan.

### Indexes added (the why)

- `FieldGroup (OwnerPracticeId, Category, IsGlobal)` — admin UI list-and-filter.
- `FieldGroup (ParentLogicalId)` — "is there a fork of this global?" lookups.
- `FieldGroupVersion (FieldGroupLogicalId, Version)` UNIQUE — addressable handle for template references.
- Same shape on `FormTemplate` / `FormTemplateVersion`.
- `FormInstance (AppointmentId)` — render forms for an appointment.
- `FormInstance (Status, SubmittedAt)` — find recently-submitted instances for review.
- `AuditLog (UserId, Timestamp)` — "what did this user do?"
- `AuditLog (PracticeId, Timestamp)` — "what happened in this tenant?"
- `AuditLog (EntityType, EntityId, Timestamp)` — "who touched this entity?"

## What's NOT in Phase 2

- **File-blob storage** (insurance card photos, etc.) — punted to a Phase 2b. The `Field.Type = File` enum value exists, but the `FileBlob` table and `IFileStorage` abstraction will land alongside the first form that actually needs file uploads.
- **Backfill of legacy `PracticeForm` / `IntakeFormResponse`** — old tables stay alive and read-only. Backfill ships in Phase 5 alongside the renderer that uses the new system. Two systems coexist for at least one stable release before legacy is dropped (parking lot #9).
- **Seeded global groups and templates** (Contact Info, Address, Insurance, the two Medical History groups) — those are Phase 3 work, alongside the SuperAdmin admin UI that creates them.
- **Audit-log writes from existing controllers** beyond login/failed-login — Phase 3 systematically adds audit calls to Client/Appointment/FormInstance read+write paths. The current AuditService is fully usable; consumer wiring is the next step.
- **Append-only DB enforcement on `AuditLogs`** — application code already never updates/deletes audit rows, but the `REVOKE UPDATE, DELETE` SQL grant is a deployment-time operation. Captured in parking lot #15.

## What you need to run

```powershell
cd "C:\Users\jwgib\source\repos\Schedule App\ProScheduleAPI"
dotnet ef migrations add AddFormGroupsTemplatesInstancesAndAudit
dotnet ef database update
```

This migration is the largest one to date — six new tables (`FieldGroups`, `FieldGroupVersions`, `FormTemplates`, `FormTemplateVersions`, `FormInstances`, `AuditLogs`) plus their indexes and FKs. Generation should still be near-instant since EF diffs the snapshot in-memory, but the `database update` will take a few seconds longer than usual on slow disks.

Inspect the generated `<timestamp>_AddFormGroupsTemplatesInstancesAndAudit.cs` file before applying if you want to eyeball it. There's nothing weird in there — just `CreateTable` calls and `CreateIndex` calls — but it's worth a once-over since it's the foundation for everything Phase 3+ builds on.

## Quick smoke test

After the migration applies and the API is running, test the audit wiring:

1. Sign in to the Angular UI with bad credentials. Expect a 401.
2. Sign in with correct credentials. Expect to land on your normal post-login route.
3. Connect to the DB and run:
   ```sql
   SELECT TOP 5 Id, Timestamp, UserId, Role, IpAddress, Action, EntityType, EntityId
   FROM dbo.AuditLogs ORDER BY Id DESC;
   ```
   You should see one `FailedLogin` row (with EntityId = the email you typed) and one `Login` row (with EntityId = your user id).

If those rows show up, Phase 2 is wired end-to-end and Phase 3 (admin UI for managing groups/templates) can build on it.

## Roll-back

Standard pattern:

```powershell
dotnet ef database update <previous-migration-name>
dotnet ef migrations remove
```

Then revert the entity additions and AuthController changes from git. The new `IAuditService` registration in `Program.cs` would also need backing out — the AuthController constructor no longer compiles without it.
