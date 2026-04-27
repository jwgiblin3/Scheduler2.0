# Phase 3 (partial) — Field Groups + Audit Log SuperAdmin screens

**Status:** Code complete. No new EF migration this phase — schema didn't change. Just one CLI invocation to seed standard global groups.

## What's now visible in the Admin Console

The two greyed-out tiles you saw are now real screens:

- **Field Groups** (`/admin/field-groups`) — list with category filter, "+ New Group" button, click any row to edit. Editing creates a new version row server-side (the UI doesn't expose version numbers — admins just edit and save). Soft-delete via the × button.
- **Audit Log** (`/admin/audit`) — paginated browser with filters for action, entity type, user, practice, and a date range. Read-only.

The other three tiles (Form Templates, Practices, Admin Users) stay placeholders. They'll fill in as the corresponding features ship.

## What you need to run

No DB migration this phase. One optional CLI command to populate seed data:

```powershell
cd "C:\Users\jwgib\source\repos\Schedule App\ProScheduleAPI"
dotnet run -- seed-form-groups
```

That seeds the eight standard global groups straight from your brief: Contact Information, Address, Emergency Contact, Insurance Information, Medical Background (shared), Medical History — Chiropractic, Medical History — Massage Therapy, Consents & Signature. The chiro and massage history groups both reference the BodyDiagram field type; once the existing image-map component is wired into the renderer in Phase 5 they'll render natively.

The seeder is idempotent — re-running skips groups that already exist (matched by name). Safe to run twice if a partial save happened.

After seeding, restart the API normally (`dotnet run` with no args), then sign in as your SuperAdmin in the Angular UI. You'll land at `/admin`. Click the green "Available" Field Groups tile — you should see the eight seeded groups, each tagged by category. Click one to edit it.

For the Audit Log, you should already see your own login event from earlier; if you log in and out a few times you'll see a Login row each time. Once you start creating/editing field groups, you'll see Create / Update / Delete rows tagged with `EntityType = FieldGroup`.

## What got built (backend)

`Controllers/Admin/FieldGroupsController.cs` — `[Authorize(Policy="ManageGlobals")]` CRUD. List with filter, get-with-current-version, get-version-history, create (writes FieldGroup + Version v1), update (creates v(current+1), bumps `CurrentVersion`), soft-delete. Audit calls on create / update / delete.

`Controllers/Admin/AuditLogController.cs` — `[Authorize(Policy="SuperAdmin")]` read-only list with filters and pagination. Joins to AppUser and Practice for readable rows.

`DTOs/FieldGroupDtos.cs` — wire shapes for the list, detail, create, update, version history, and the embedded Field/Option/ConditionalLogic.

`DTOs/AuditLogDtos.cs` — paginated row + page envelope.

`Services/FormGroupSeeder.cs` — the eight standard groups, idempotent. Uses the same `Field` POCO shape the editor reads/writes so seeded groups render in the editor without translation.

`Program.cs` — second CLI command branch for `seed-form-groups`, alongside `seed-superadmin`.

## What got built (frontend)

`core/models/admin-models.ts` — TypeScript mirrors of the C# DTOs and enums (FieldType, FieldWidth, AuditAction).

`core/services/admin-api.service.ts` — `AdminApiService` with the field-group CRUD and audit log GET. Uses the existing JWT auth interceptor so calls are authenticated automatically.

`features/admin/field-groups/field-groups-list.component.{ts,html,scss}` — list with category filter, soft-delete toggle, "+ New Group" link. Empty-state copy points at the seed CLI.

`features/admin/field-groups/field-group-edit.component.{ts,html,scss}` — full editor. Group metadata (name, category typeahead, description, PHI flag) plus a per-field repeater with type, width, required, PHI, help text, and a structured options editor for select/radio/multiselect/checkbox-group. Up/down move buttons (no drag-drop in v1; can land later). Validation in `onSave()` — non-empty label per field, ≥ 2 valid options for option-using types.

`features/admin/audit-log/audit-log.component.{ts,html,scss}` — filter row (action, entity type, userId, practiceId, datetime range), paginated table with colored action chips, joined user and practice names, prev/next page controls.

`app.routes.ts` — `/admin` is now a parent route with children `field-groups`, `field-groups/new`, `field-groups/:id/edit`, `audit`. All inherit the `superAdminGuard`.

`features/admin/admin-home.component.html` — Field Groups and Audit Log tiles upgraded from placeholder `<div>` to clickable `<a routerLink>` with a green "Available" badge.

## Notes / caveats

- The field editor exposes 17 field types from the enum but **BodyDiagram, AddressBlock, File, and PaymentMethod are not yet renderable**. They show up in the type dropdown so you can author groups now (the seed already uses BodyDiagram), but you can't use them in a real client-facing form until Phase 5 wires the renderer + Phase 2b adds file storage. The dropdown labels them honestly so you know.
- Conditional logic is in the data model but **not yet authorable** through the editor. Add it directly via `FieldGroupVersion.FieldsJson` in SQL if you need it before the conditional-logic editor ships.
- Soft-deleted field groups still appear in the list when you toggle "Show deleted." They can't be restored through the UI yet — manual SQL `UPDATE FieldGroups SET DeletedAt = NULL WHERE ...` works.
- The audit log doesn't yet have a CSV export. Parking lot #16.
- The audit log filter for `entityType` is a free-text exact match. Common values to try: `AppUser`, `FieldGroup`. After Phase 5, you'll also see `FormInstance`, `Client`, `Appointment`, `FileBlob`.

## What's NOT in this phase

- Form Templates screen (the next obvious follow-on — assemble field groups + standalone fields into ordered templates).
- Practices browser (cross-tenant inspection).
- Admin Users management (add/remove SuperAdmins from UI; today only the seed CLI bootstraps).
- File-blob storage (still parked until the first form actually needs uploads).
- Per-field PHI flag → audit-routing wiring (today everything goes through group-level PhiFlag).
- Versioned diffing UI (parking lot — see if anyone actually wants it before building).
