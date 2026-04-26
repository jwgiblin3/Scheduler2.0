# ProSchedule Parking Lot — Deferred Items & Future Considerations

A running list of decisions we've explicitly punted, ideas worth revisiting, and known limits we've baked in. Add freely when something pops up; don't delete items — mark them resolved with a date and the resolution.

**Last updated:** 2026-04-26

---

## How to use this file

When something comes up that's interesting but out of scope for what we're building right now, log it here instead of expanding the current scope. Each row captures *enough* context that a future-you can understand the original tradeoff without re-litigating it from scratch.

Columns:

- **#** — stable ID; never reuse, never reorder.
- **Item** — the deferred work, in one line.
- **Category** — `Arch` (architecture), `Sec` (security/compliance), `UX`, `Integration`, `Perf`, `Ops`.
- **Notes / Why deferred** — the trade-off we made and why now isn't the moment.
- **Revisit when** — the trigger that should pull this back into scope.
- **Status** — `Open`, `In progress`, `Resolved (date + outcome)`, `Wontfix (date + reason)`.

---

## Active Items

| # | Item | Cat | Notes / Why deferred | Revisit when | Status |
|---|---|---|---|---|---|
| 1 | Stripe / Stripe Elements payment integration | Integration | Tabled per John 2026-04-26. App will not collect payment in v1. Until then, no `payment_method` field type, no Stripe SDK, no PCI scope. | First customer asks for booking deposits / pay-at-booking. | Open |
| 2 | Drawn signature (canvas/SVG) | UX | v1 ships typed-name signatures with audit trail (IP + timestamp + document version). Drawn signatures are UX-only, no compliance benefit. | Patients complain that typed name "doesn't feel real" or a customer asks for it specifically. | Open |
| 3 | Cryptographic e-signature (DocuSign / Adobe Sign) | Integration | Typed + audit trail is HIPAA-sufficient for clinical consents. Cryptographic signatures are for cross-state legal disclosures and court-defensible artifacts. | Multi-state regulatory disclosure or a customer demands court-grade signatures. | Open |
| 4 | Azure Blob Storage for file uploads | Sec | Using SQL Server `varbinary(max)` via an `IFileStorage` abstraction in v1 (no external deployment yet). The abstraction means the swap is a one-implementation-class change. | Moving to external deployment, hitting LocalDB size limits, or a customer requires a HIPAA BAA we can't provide via SQL Server alone. | Open |
| 5 | Conditional logic — AND/OR composition | UX | v1 supports simple `show-if FieldX = ValueY`. Compound rules need a rule-builder UI, which is real work. | A real form definition can't be expressed with single-condition rules (e.g. "show prenatal block if Sex = Female AND Pregnant ≠ No"). | Open |
| 6 | Tenant "rebase to latest global" action | UX | Copy-on-write forks stay on their version forever. There's no "pull in the new global fix" button in v1. | A practice-admin asks "I customized this template, but I want the new global update too." | Open |
| 7 | Normalize form-field JSON columns into relational tables | Arch | `FieldGroupVersion.FieldsJson` and `FormTemplateVersion.ItemsJson` are `nvarchar(max)` JSON in v1. Trade-off: no efficient queries *into* fields. | Admin needs to answer "which groups reference field X?" or "find all templates using body_diagram" at a scale where JSON path queries are too slow. | Open |
| 8 | `UserRole` enum → Identity Roles or permission-based authz | Arch | 4 roles (SuperAdmin, Admin, FrontDesk, Client) fit comfortably. Beyond ~8-10 roles, or once we need per-feature permissions, the enum becomes a liability. | We add a 5th or 6th role, or any feature needs "this admin can do X but not Y." | Open |
| 9 | Decommission legacy `PracticeForm` / `IntakeFormResponse` tables | Arch | Old tables stay read-only alongside the new system for at least one stable release as a safety net. | One full release after Phase 5 (new system in production) with no rollback events. | Open |
| 10 | Personal Trainer (PT) seed pack | UX | v1 seeds chiro + massage groups/templates. PT is the third announced vertical but we have no PT-specific groups yet. | First PT customer signs up or product asks for PT outreach. | Open |
| 11 | Multi-vertical practice (one practice serves chiro AND massage) | Arch | Templates carry a single `TargetAudience`. Assumption: a practice picks one audience or attaches templates from multiple. Need to verify the UX of mixed-audience practices. | A customer reports "I'm a chiro AND a massage therapist — how do I do both?" | Open |
| 12 | **Client info extraction → structured Client sub-tables** ⭐ | Arch | NEW (per John 2026-04-26). On form submit, parse structured PHI/PCI into typed tables: `ClientContactInfo`, `ClientAddress`, `ClientEmergencyContact`, `ClientInsurance`, `ClientMedicalHistory`. Each becomes its own audit-able unit, so reports can show "who viewed insurance this week" vs "who viewed contact info." Form remains the system of capture; structured tables become the system of record for audits and search. Phase 2 schema will leave hooks (FKs from `Client` to `Client*Info` tables); the *extraction service* itself ships in a later phase. | Audit reporting demands granular categories beyond per-form. | Open |
| 13 | Multi-practice client identity unification | Arch | Today: each practice has its own `Client` row even for the same person (Jane Doe at Practice A and Practice B = two `Client` rows). HIPAA-correct (each practice is a separate Covered Entity), but UX-inefficient (Jane fills out name and DOB twice). Could introduce a canonical `Person` profile per `AppUser` that pre-populates new `Client` rows. | A customer/patient complains about duplicate data entry across practices, or we introduce client-side cross-practice features. | Open |
| 14 | GDPR / CCPA "right to delete" workflow | Sec | HIPAA requires 6yr retention; EU/CA residents have right-to-delete that conflicts. v1 has no delete-on-request flow. | First international customer, first DSAR request, or legal review forces it. | Open |
| 15 | Application Insights / external audit-log streaming | Ops | v1 audit log is a single SQL table with append-only via revoked DELETE perm. External streaming gives tamper-evident backup and search at scale. | SQL audit table grows beyond ~50M rows or a SOC2 audit asks for tamper evidence. | Open |
| 16 | Advanced audit-log query/export UI | UX | v1 SuperAdmin sees a basic chronological browser at `/admin/audit`. Filters (by user / by entity / by date range) and CSV export are nice-to-have. | Compliance officer or auditor asks for a specific report we can't easily produce. | Open |
| 17 | Body-diagram component formal integration | Integration | Component already exists in the codebase. v1 wires it as `field.type === 'body_diagram'` in the new renderer. May need API tweaks once we look at it closely. | Phase 5 renderer work begins. | Open |
| 18 | PHI search inside form responses | Arch | "Find all clients with allergy = penicillin" requires either normalized response fields or a JSON-path index. Not in v1; responses stay as `ResponsesJson`. | Practice or SuperAdmin asks for a cross-client report by form-field value. | Open |
| 19 | Notification preferences refactor | UX | `SmsOptIn` / `PushOptIn` live on `Client` per practice. Long term should consolidate into a single per-AppUser preferences object. | Adding a third channel (push, in-app) or a customer asks "why do I get texts from Practice A but not B." | Open |
| 20 | Practice-admin role visibility into other practice templates (read-only) | UX | Today Admin sees only their own practice. Some customers may want "show me how Practice X has customized this global template." | Marketing wants a "see how others use this" feature, or an enterprise customer with multiple practices asks. | Open |
| 21 | Structured-client-extraction tables (`ClientContactInfo`, `ClientInsurance`, `ClientMedicalHistory`, etc.) | Arch | Per John 2026-04-26: do NOT pre-create empty tables in Phase 2 — too easy to forget what they're for and mistake them for live tables. Phase 2 ships only the form-group/template/instance schema. When granular audits become a priority, build the structured tables and the on-submit extraction service together as a single feature. Supersedes #12 — see resolved item below. | Audit reporting demands per-category visibility (CC vs contact vs medical), or cross-form PHI search (#18) becomes a real need and we want to solve both at once. | Open |

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 12 | Client info extraction → structured Client sub-tables (early version) | 2026-04-26 — Resolved (merged into #21). Original framing was "pre-create empty tables in Phase 2 with hooks ready." John overruled — building unused tables creates confusion. New framing in #21: build the tables AND the extraction service together, only when the granular-audit need is real. |

*(empty — items move here once shipped or explicitly killed, with date and outcome)*

---

## Conventions

- Add new rows at the bottom with the next sequential ID. Never reuse IDs.
- If two items collapse into one, mark the older one `Resolved (merged into #N)` rather than deleting.
- A short, dated note in **Notes** is more useful than a perfect description — capture the gut-feel reason in the moment.
