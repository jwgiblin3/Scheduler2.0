using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

/// <summary>
/// Append-only access trail required by HIPAA's Security Rule
/// (45 CFR § 164.312(b)) and useful generally for support, security
/// investigations, and customer trust. See ADR-001 §10.7 for the policy.
///
/// **One row per access event** — granularity is the entity, not the
/// individual field. Reading a FormInstance generates one row, not one
/// per field on the form. We capture the *list of changed-field-names*
/// for updates so audit reports can answer "what was modified" without
/// recording PHI values themselves.
///
/// **Never store PHI values** here. Storing them would create a parallel
/// PHI store with the same compliance burden, recursively. Names of fields
/// touched is the right granularity.
///
/// **Append-only enforcement** is layered:
///   1. Application code never updates or deletes AuditLog rows.
///   2. Operationally, the SQL principal the app runs as should have
///      INSERT-only on dbo.AuditLog (REVOKE UPDATE, DELETE). A separate
///      maintenance principal handles 6-year retention pruning. Not
///      enforced by EF — it's a deployment-time grant.
/// </summary>
public class AuditLog
{
    public long Id { get; set; }

    /// <summary>UTC microsecond-precision timestamp of the event.</summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// AspNetUsers id of the actor. Null only for unauthenticated events
    /// (failed login attempts before the user is identified, etc.).
    /// </summary>
    public int? UserId { get; set; }
    public AppUser? User { get; set; }

    /// <summary>
    /// Snapshot of the user's role at event time. Stored as a string to
    /// stay readable across role-enum reshuffles. Never null when UserId
    /// is set.
    /// </summary>
    [MaxLength(40)]
    public string? Role { get; set; }

    /// <summary>
    /// IP the request originated from. Captured from
    /// <c>HttpContext.Connection.RemoteIpAddress</c>. v6 addresses fit
    /// within 45 chars; we allocate 64 for headroom.
    /// </summary>
    [MaxLength(64)]
    public string? IpAddress { get; set; }

    public AuditAction Action { get; set; }

    /// <summary>
    /// The .NET type name of the entity touched ("FormInstance", "Client",
    /// "Appointment", "FileBlob"). Stored as a string so adding new
    /// entities doesn't require a column change.
    /// </summary>
    [Required, MaxLength(80)]
    public string EntityType { get; set; } = string.Empty;

    /// <summary>
    /// Stringified primary key. Some entities are int (Client.Id), some
    /// are Guid (FieldGroup.LogicalId), some are composite — string
    /// covers all of them.
    /// </summary>
    [Required, MaxLength(80)]
    public string EntityId { get; set; } = string.Empty;

    /// <summary>
    /// Tenant context. Null for cross-tenant SuperAdmin actions and for
    /// pre-auth events like FailedLogin.
    /// </summary>
    public int? PracticeId { get; set; }

    /// <summary>
    /// JSON array of field names changed in an Update event. Always JUST
    /// names, never values. Null for non-Update actions. nvarchar(max)
    /// because update-many-fields could exceed any short cap, but in
    /// practice this stays small.
    /// </summary>
    public string? ChangedFieldsJson { get; set; }

    /// <summary>
    /// Optional human-readable note ("Login from new device",
    /// "Bulk export of 47 records"). Free-form, never holds PHI.
    /// </summary>
    [MaxLength(500)]
    public string? Note { get; set; }
}

/// <summary>
/// Catalog of audit-able actions. Keep this list small and well-defined —
/// it's better to overload an existing action with a Note than to invent
/// new ones for each variation.
/// </summary>
public enum AuditAction
{
    Read = 0,
    Create = 1,
    Update = 2,
    Delete = 3,
    Print = 4,
    Export = 5,
    Login = 6,
    FailedLogin = 7,
    /// <summary>Form instance specifically transitioned to Submitted.</summary>
    Submit = 8,
    /// <summary>Form instance transitioned to Voided.</summary>
    Void = 9
}
