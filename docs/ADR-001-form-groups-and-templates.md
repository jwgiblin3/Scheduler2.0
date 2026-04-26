# ADR-001: Reusable Field Groups and Versioned Form Templates

**Status:** Accepted (2026-04-26)
**Date:** 2026-04-26
**Deciders:** John (product owner / sole engineer)
**Supersedes:** N/A (first ADR; documents the move from the current `PracticeForm` flat-fields system)

---

## 1. Context

The app today supports per-practice intake forms via a single `PracticeForm` row that stores a JSON array of `IntakeFormField` (label, type, required, options). It works for chiropractors but doesn't scale to:

- **Multi-vertical expansion** (massage, personal training) — every new vertical would mean fork-and-edit forms per tenant.
- **Reuse across templates** — every form re-declares Contact, Address, Insurance from scratch.
- **Layout** — fields render full-width, no half/third/quarter grid.
- **PHI/HIPAA tagging** — no field-level flag for audit logs and access control.
- **Versioned history** — editing a form retroactively changes already-submitted responses' rendering.

You want a system where field groups are reusable Lego blocks, templates are ordered collections of groups, and submitted forms are frozen at the group/template versions in effect at submit time. A new platform-level **Superadmin** role manages global templates; practices (tenants) get copy-on-write overrides.

### Constraints already in the codebase
- .NET 9 + EF Core, SQL Server (LocalDB in dev).
- Identity is keyed by `int`. Existing `UserRole` enum has `Admin` (practice-level), `FrontDesk`, `Client`.
- `PracticeForm` + `IntakeFormResponse` + `AppointmentTypeForm` already wire forms to appointment types and responses to appointments.
- No SSR; Angular standalone components with Kendo theme.

---

## 2. Decision (summary)

1. Introduce three new aggregates: **`FieldGroup`**, **`FormTemplate`**, **`FormInstance`**. `Field` is **embedded** in groups (and as standalone items in templates), not a top-level entity.
2. **Versioning is per-aggregate, immutable, and append-only.** Groups and templates have a `(LogicalId, Version)` composite identity. Instances pin to specific versions forever.
3. **Copy-on-write tenant overrides.** A global group/template that a practice edits is forked into a tenant-owned row with `ParentLogicalId` pointing back. Non-customized tenants automatically get global updates.
4. **Layout is data, not HTML.** Each field has a `Width` enum (`Full`, `Half`, `Third`, `Quarter`); the renderer flows fields into a CSS grid. No raw HTML from admins.
5. **PHI flagging** on fields and groups — surfaced into audit logs and access control middleware.
6. **Add `SuperAdmin` to `UserRole`** with no `PracticeId`. New `[Authorize(Policy="SuperAdmin")]` policy gates global-template management.
7. **Existing `PracticeForm` data is migrated** into a tenant-owned `FormTemplate` with a single auto-generated `FieldGroup` per legacy form. Old API endpoints continue serving until v1 of the new endpoints ships.
8. **Storage strategy:** structural rows (groups, templates, instances) are relational; field arrays inside a group/template version stay as `nvarchar(max)` JSON for now (low write volume, complex shape, existing pattern matches). Revisit if we ever need to query into individual field properties at scale.

---

## 3. Options Considered

### Decision 3a — How to store field definitions

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. JSON column on group/template version** ✅ | Each `FieldGroupVersion` row carries `FieldsJson nvarchar(max)`. | Matches current pattern; one row per version is naturally immutable; simple migrations; no joins to render. | Can't index into individual fields; admin search ("which groups use field X?") requires JSON path queries. |
| B. Normalized `Fields` table | One row per field per group-version. | Queryable; classic relational shape. | Massive write amplification on every group edit; rendering needs joins; ordering column needed everywhere; no clear win for our scale (low write volume, ≤ ~30 fields/group). |
| C. Hybrid (rows + JSON) | Rows for searchable metadata (name, type, phi_flag), JSON for everything else. | Best of both. | Two sources of truth → drift bugs. |

**Pick A.** We don't have query-into-field-internals use cases today, and the entire group/version is the unit of work for editing and rendering. Defer normalization until a concrete need appears.

### Decision 3b — Versioning granularity

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Version the whole template | One version-bump per template change. | Simplest. | Edit one group → bump every template that references it; instances pin to template only and lose ability to detect "did THIS group change?" |
| **B. Version groups and templates independently** ✅ | `FieldGroup.Version` and `FormTemplate.Version` evolve separately. Templates reference `(GroupLogicalId, GroupVersion)`. Instances pin both. | Independent reuse; minimal version churn; clean audit story. | Two version dimensions to reason about; two history UIs. |
| C. Event-sourced field-level versioning | Each field edit is an event. | Maximum granularity. | Massive overkill; complex rendering. |

**Pick B.** Matches your brief and the trade-off is acceptable.

### Decision 3c — Tenant overrides

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Patch overlay on global | Tenants store a JSON patch applied at render time. | Auto-rebases on global changes. | Conflict semantics are hairy; renderer complexity high; debugging painful. |
| **B. Copy-on-write fork** ✅ | First edit clones the global into a tenant-owned row with `ParentLogicalId`. | Isolation; predictable; matches your brief; easy to show "(customized)" in UI. | Forked tenants miss future global updates unless we add an explicit "rebase" action. |
| C. Block tenant edits entirely | Globals are read-only. | Simplest. | Doesn't meet the requirement. |

**Pick B**, with a future "rebase to latest global" feature parked as an enhancement (not v1).

### Decision 3d — Admin role placement

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Add `SuperAdmin` to existing enum** ✅ | One row in `UserRole`. Policy: `User.Role == SuperAdmin && PracticeId == null`. | Simplest; matches existing auth code. | Hardcoded ceiling at ~256 roles (we're at 4). |
| B. Identity Roles table | Use ASP.NET Identity's `IdentityRole<int>` (already registered). | More flexible long-term. | Two parallel role systems would be confusing; current code reads `User.Role`. |
| C. Permission-based | Replace roles with discrete permissions. | Most flexible. | Big refactor; not justified yet. |

**Pick A** for now; revisit when we hit ~10 roles.

---

## 4. Data Model

### Entity diagram (logical)

```
Field (value object — embedded)
  ├ Id                 string (stable across versions of same group)
  ├ Type               enum   (text, textarea, date, select, multiselect,
  │                            email, phone, signature, file, body_diagram,
  │                            checkbox, radio, number, address_block, …)
  ├ Label              string
  ├ Placeholder        string?
  ├ HelpText           string?
  ├ Required           bool
  ├ Width              enum   (Full, Half, Third, Quarter)
  ├ MaxLength          int?
  ├ MinLength          int?
  ├ Pattern            string?  (regex)
  ├ Options            list<{value,label}>?  (select/radio/checkbox)
  ├ PhiFlag            bool
  └ ConditionalLogic   { showIf: { fieldId, op, value } }?

FieldGroup                                FieldGroupVersion (immutable)
  ├ Id (LogicalId)  ◄────────────────── ├ Id (PK)
  ├ Name                                  ├ FieldGroupId (FK → LogicalId)
  ├ Category                              ├ Version (int, monotonic)
  ├ IsGlobal                              ├ Name (snapshot at version)
  ├ ParentLogicalId? ── (override link)   ├ Description (snapshot)
  ├ OwnerPracticeId? (null if global)     ├ FieldsJson (the Field[] above)
  └ CurrentVersion ── (latest pointer)    ├ PhiFlag (group-level)
                                          ├ ConditionalLogic? (group-level)
                                          ├ CreatedAt
                                          └ CreatedByUserId

FormTemplate                              FormTemplateVersion (immutable)
  ├ Id (LogicalId)  ◄────────────────── ├ Id (PK)
  ├ Name                                  ├ FormTemplateId (FK → LogicalId)
  ├ TargetAudience  (chiro|massage|pt|generic)
  ├ IsGlobal                              ├ Version
  ├ ParentLogicalId? (override link)      ├ Name (snapshot)
  ├ OwnerPracticeId? (null if global)     ├ ItemsJson — ordered list of:
  └ CurrentVersion                        │     { kind: "group",
                                          │       groupLogicalId, groupVersion }
                                          │   | { kind: "field", field: Field }
                                          ├ CreatedAt
                                          └ CreatedByUserId

FormInstance (replaces IntakeFormResponse going forward)
  ├ Id
  ├ AppointmentId (FK)
  ├ FormTemplateVersionId (FK)        — pinned at send time
  ├ PinnedGroupVersionsJson           — { groupLogicalId: groupVersion, … }
  ├ Status (Pending, InProgress, Submitted, Voided)
  ├ ResponsesJson  { fieldId: answer }
  ├ StartedAt, SubmittedAt
  └ Snapshot (denormalized template+groups at send time, for forever-render)
```

### Key shape decisions

- **`LogicalId` vs `Id`**: groups and templates have a *logical* identity that's stable across versions. New version = new `…Version` row, but `LogicalId` is unchanged. References from templates → groups use `LogicalId + Version`.
- **`Snapshot` on `FormInstance`**: the *rendered structure* (template + each pinned group, expanded into a single JSON tree) is denormalized onto the instance at send time. Means submitted forms render even if the template/group rows are deleted later.
- **Tenant overrides resolve at template-version creation, not render time**: when a practice forks a global group, the practice's templates that reference it can either continue pointing at the global `LogicalId` (auto-uses tenant fork because the fork's `ParentLogicalId` matches) or be re-pointed to the fork's new `LogicalId`. We pick the latter — explicit, easier to reason about. Tradeoff: requires re-saving the template once after forking.

### Existing-system migration

| Old | New |
|---|---|
| `PracticeForm` | One `FormTemplate` (tenant-owned, `IsGlobal=false`) per row, with one auto-named `FieldGroup` ("Imported Form") containing all fields verbatim. `Version=1`. |
| `IntakeFormField.Type` values | Map 1:1; new types (`body_diagram`, `email`, `phone`, etc.) become available going forward. |
| `IntakeFormResponse` | Migrate into `FormInstance` with `Status=Submitted`, `Snapshot` built from the imported template version. Keep the old table read-only for one release as a safety net. |
| `AppointmentTypeForm` | Repoint FK from `PracticeFormId` to `FormTemplateLogicalId`. Templates always resolve to the tenant's latest non-deprecated version unless an override is in play. |

---

## 5. Versioning Rules

The brief lists 6 design rules; restating with the implementation contract:

1. **Immutable versions.** A `FieldGroupVersion` or `FormTemplateVersion` row is never updated after creation. Edits create a new row with `Version = max + 1`. We enforce this with EF Core entity config (`.Property(...).IsConcurrencyToken()` plus a DB CHECK).
2. **In-flight forms don't migrate.** A `FormInstance` with `Status` in `{Pending, InProgress}` retains its pinned versions. Editing the underlying template or group has zero effect on it.
3. **Submitted forms never migrate.** `Status = Submitted` rows are render-only and rely on `Snapshot`.
4. **Layout via `Width`, never HTML.** Renderer maps `Full=1`, `Half=2`, `Third=3`, `Quarter=4` columns of a CSS grid. Admin UI offers a width picker only — no rich-text editor for fields.
5. **Copy-on-write.** First save on a tenant-overridden global group creates a new `FieldGroup` row with `IsGlobal=false`, `OwnerPracticeId=tenant`, `ParentLogicalId=globalLogicalId`. Same logic for templates.
6. **PHI flagging.** Any field with `PhiFlag=true` (and any group with group-level `PhiFlag`) is recorded on access in an audit log row. Access control middleware checks role + PHI scope.
7. **(NEW) Soft-delete only.** Groups and templates use `DeletedAt` rather than hard delete, so historical instances always have something to render even if `Snapshot` is corrupted.

---

## 6. Field-Length Recommendations

You said "use your judgement, we'll adjust." Proposed defaults — applied as `MaxLength` on both DB columns (existing entities) and the new `Field.MaxLength` for the form system:

| Category | Field | MaxLength | Notes |
|---|---|---|---|
| Identity | First name | 50 | RFC-5322 et al. allow more, but >50 is overwhelmingly noise. |
|  | Middle initial | 2 | Single char + period; cap at 2 for safety. |
|  | Last name | 80 | Compound names exist (van der …); be generous. |
|  | Full legal name (free) | 150 | If we ever add it. |
|  | Preferred name | 50 | |
| Contact | Email | 254 | RFC 5321 hard cap. |
|  | Phone | 20 | International with formatting. |
|  | Preferred contact method | 20 | Enum-ish. |
| Address | Street line 1 | 100 | USPS line cap is 64; we go higher for international. |
|  | Apt/Unit | 20 | |
|  | City | 60 | |
|  | State / region | 50 | Full name OR 2-char code; cap covers both. |
|  | Postal code | 20 | International formats. |
|  | Country | 60 | |
| Demographic | DOB (string repr) | 10 | ISO 8601 date — but store as `date` in DB. |
|  | Sex/Gender | 50 | Inclusive picker fits. |
| Medical | Chief complaint | 500 | One paragraph. |
|  | Allergies (free text) | 500 | |
|  | Current medications | 1000 | Listy. |
|  | Past surgeries | 1000 | |
|  | Notes / additional info | 2000 | |
| Insurance | Carrier | 100 | |
|  | Member ID | 50 | |
|  | Group number | 50 | |
|  | Policyholder name | 130 | First+Last. |
| Internal | Practice name | 120 | |
|  | Provider display name | 80 | |
|  | Form template name | 120 | |
|  | Form group name | 120 | |

These ship as: (a) `[MaxLength]` data annotations on existing entity properties (Client, Provider, Practice, etc.) and a migration that adds `nvarchar(N)` lengths; (b) defaults applied when seeding the new global field groups; (c) Angular reactive-form `Validators.maxLength(N)` mirrored on the front end.

---

## 7. Admin Role & Permissions

### Role addition

```csharp
public enum UserRole
{
    SuperAdmin = -1,   // platform-wide; PracticeId must be null
    Admin = 0,         // existing practice-level admin
    FrontDesk = 1,
    Client = 2
}
```

Invariant enforced in `AppUser` entity: `Role == SuperAdmin → PracticeId == null`. A DB `CHECK` constraint plus an EF Core `IValidatableObject` impl.

### Authorization policies

```csharp
options.AddPolicy("SuperAdmin",      p => p.RequireRole("SuperAdmin"));
options.AddPolicy("PracticeAdmin",   p => p.RequireRole("SuperAdmin", "Admin"));
options.AddPolicy("ManageGlobals",   p => p.RequireRole("SuperAdmin"));
options.AddPolicy("ManageTenant",    p => p.RequireAssertion(ctx =>
    ctx.User.IsInRole("SuperAdmin") ||
    (ctx.User.IsInRole("Admin") && /* tenant scope check */)));
```

### Admin-only routes (Angular)

```
/admin                      — landing
/admin/templates            — list global templates (audience filter)
/admin/templates/:id        — editor
/admin/groups               — list global groups (category filter)
/admin/groups/:id           — editor (versions tab)
/admin/practices            — cross-tenant practice browser
/admin/practices/:id/forms  — see how a tenant has overridden globals
/admin/users                — superadmin user management
/admin/audit                — PHI access log viewer
```

Guarded by an `adminGuard` that calls `/auth/me` and checks `role === 'SuperAdmin'`.

### Bootstrapping the first SuperAdmin

A one-time CLI command: `dotnet run -- seed-superadmin --email you@x.com --password ...`. Refuses to run if any SuperAdmin already exists. Lives next to the EF migrations entrypoint.

---

## 8. Phased Implementation Plan

Each phase is independently shippable. Stop after any phase if priorities shift.

### Phase 0 — Field-length quick win (≈ ½ day)
- Add `[MaxLength]` annotations across existing entities (table in §6).
- Add Angular `Validators.maxLength` to matching reactive forms.
- One EF migration: `AddFieldLengthLimits`.
- **No new tables.** Risk: low. Can ship today.

### Phase 1 — SuperAdmin role + admin shell (≈ 1 day)
- Add `SuperAdmin` to `UserRole`; add invariant + CHECK constraint.
- Authorization policies in `Program.cs`.
- `seed-superadmin` CLI command.
- Angular `/admin` route + `adminGuard` + minimal shell. No real screens yet.

### Phase 2 — Field/Group data model + migration of existing forms (≈ 3 days)
- New entities: `FieldGroup`, `FieldGroupVersion`, `FormTemplate`, `FormTemplateVersion`, `FormInstance`.
- Migration that:
  - Creates new tables.
  - Copies every `PracticeForm` row into `FormTemplate` (v1) + auto-named `FieldGroup` (v1).
  - Copies every `IntakeFormResponse` into `FormInstance` (Status=Submitted, Snapshot built).
  - Leaves old tables untouched (read-only safety net).
- **No UI yet.** Old endpoints keep working off the old tables.

### Phase 3 — SuperAdmin UI for global groups & templates (≈ 4 days)
- `/admin/groups` CRUD with version history viewer.
- `/admin/templates` CRUD with drag-reorder of group references and standalone fields.
- `Width` picker, `PhiFlag` toggle, conditional-logic builder (basic: show-if equals).
- Seed script: 7 default chiro groups from your brief.

### Phase 4 — Tenant override (copy-on-write) + practice-admin override UI (≈ 3 days)
- Practice admin sees globals + an "Override" button.
- Override forks group/template into a tenant-owned row.
- "(customized from default)" badge in lists.
- Backend resolution: when a practice's effective template references a global group's `LogicalId`, the resolver checks for a tenant fork and prefers it.

### Phase 5 — New booking + intake flow uses new system (≈ 3 days)
- Booking attaches `FormInstance` (not legacy `IntakeFormResponse`) when patient confirms.
- Renderer reads `Snapshot` for submitted instances; reads template+groups for in-flight.
- Body-diagram field type integrated as a first-class type (you already have the component — wire it to `field.type === 'body_diagram'`).

### Phase 6 — Decommission legacy `PracticeForm` (≈ 1 day, scheduled later)
- After ≥ 1 release of dual-running with no issues, drop legacy tables.
- Final migration: `RemoveLegacyIntakeFormTables`.

### Phase 7 — Multi-vertical seed packs (massage, PT) (≈ 1 day each, on demand)
- Seed scripts add audience-tagged global templates per vertical.
- No new tables; just data.

---

## 9. Consequences

**Easier**
- Adding a new vertical = ship a seed pack of templates referencing existing reusable groups.
- Editing a group automatically improves every non-overridden tenant.
- Submitted forms are forever-renderable from `Snapshot` even if all live templates are deleted.

**Harder**
- Schema is bigger (5 new tables vs. 1).
- Two version dimensions (group + template) means UI must communicate both clearly to admins.
- Tenant overrides need an explicit "rebase to latest global" path eventually.
- We must police that no one writes raw HTML into a label/help text field — server-side sanitize on save and on render.

**Need to revisit**
- Move JSON columns to normalized fields if/when admin search across fields becomes a real need.
- Permission model — the `UserRole` enum has ~3 slots left before it deserves a refactor to Identity Roles or a permission system.
- Override "rebase" UX — punted from v1.

---

## 10. Resolved Decisions (2026-04-26 sign-off)

The seven open questions from the original draft were resolved in conversation on 2026-04-26. Decisions and their effects on the design:

1. **Body diagram** — already exists in the codebase as part of an image-map component. Wires up as `field.type === 'body_diagram'` in the Phase 5 renderer. Two seeded medical-history groups will use it: *Medical History — Chiropractic* and *Medical History — Massage Therapy*. A shared *Medical Background* sub-group (allergies, meds, past surgeries) is composed by both. See parking lot #17 for any API tweaks needed once we look closely.

2. **Conditional logic** — v1 ships simple `show-if FieldX = ValueY` only. AND/OR composition deferred (parking lot #5). Rule builder UI in Phase 3 admin tool surfaces a single condition.

3. **File upload storage** — SQL Server `varbinary(max)` in a dedicated `FileBlob` table, accessed via an `IFileStorage` abstraction. Phase 2 introduces both. Azure Blob migration deferred until external deployment exists (parking lot #4). 10 MB per-file cap enforced in middleware.

4. **e-Signature legal weight** — typed name + IP + timestamp + document-version snapshot. Sufficient for HIPAA acknowledgments, financial responsibility forms, clinical consents. Drawn signatures (parking lot #2) and cryptographic e-sigs (parking lot #3) deferred.

5. **Credit-card / payment processing — TABLED ENTIRELY for v1.** No Stripe Elements, no `payment_method` field type, no PCI scope. Parking lot #1. App will not collect payment in v1; revisit when first booking-deposit / pay-at-booking customer asks.

6. **Tenant rebase to latest global** — deferred (parking lot #6). Forks stay on their version forever in v1.

7. **Audit log scope and destination** —
   - **Unit of audit:** the entire `FormInstance` (one event per View / Edit / Submit / Print / Export). No per-field audit events.
   - **Field/group PHI/PCI flagging** is preserved — it drives display logic (lock badges, redaction, access-control gates) and *which* groups generate audit events. A non-PHI group (e.g. a future "favorite music for appointments" group) wouldn't trigger audit logging at all.
   - **Storage:** single `AuditLog` table in the app's SQL Server DB. Append-only enforced via revoked DELETE permission on the app's SQL user. Separate maintenance principal handles 6yr-retention pruning. External streaming to App Insights / CloudWatch deferred (parking lot #15).
   - **Captured per event:** UTC timestamp (microsecond), `UserId`, `Role`, IP address, `Action` (Read/Create/Update/Delete/Print/Export/Login/FailedLogin), entity type + ID, `PracticeId` for tenant context, list of changed-field-names for updates. **Never** capture PHI values in the log itself.
   - **Audited entities (v1):** `FormInstance`, `Client`, `Appointment`, `IntakeFormResponse` (legacy, while alive), `FileBlob` reads, every login attempt (success and failure).

### Phase 2 schema decision (2026-04-26)

Per John's 2026-04-26 call: Phase 2 ships ONLY the form-group/template/instance schema. **Do not pre-create empty `ClientContactInfo` / `ClientInsurance` / `ClientMedicalHistory` structured tables.** Building empty tables in advance creates confusion later about which tables are live. When granular per-category audits become a priority, the structured tables and the on-submit extraction service ship together as one feature. Tracked as parking lot #21.

### PHI search across forms

Cross-form search ("find all clients with allergy = penicillin," "all clients who marked themselves pregnant in last 6 months") is acknowledged as a "could be a cool feature" but explicitly tabled. v1 keeps `FormInstance.ResponsesJson` as `nvarchar(max)` JSON. When the feature returns, it ships alongside the structured-extraction tables (parking lot #18 + #21 will likely merge).

---

## 11. Action Items (in flight)

1. [x] Review and accept ADR.
2. [x] Resolve seven open questions (§10).
3. [x] **Phase 0 — field-length annotations across entities + Angular validators.** Code complete; user runs `dotnet ef migrations add AddFieldLengthLimits` + `dotnet ef database update` to apply. See `docs/PHASE-0-NOTES.md`.
4. [x] **Phase 1 — SuperAdmin role + admin shell.** Code complete; user runs `dotnet ef migrations add AddSuperAdminRoleAndConstraint` + `dotnet ef database update`, then `dotnet run -- seed-superadmin --email ... --password ...` to bootstrap the first SuperAdmin. See `docs/PHASE-1-NOTES.md`.
5. [ ] ← **Phase 2 next** — new tables for form groups/templates/instances + audit log + file-blob storage.
6. [ ] Phases 3–6 sequenced as above.

---

*This document supersedes any informal design notes about form layout. Future ADRs that change the data model should reference and (where relevant) supersede this one.*
