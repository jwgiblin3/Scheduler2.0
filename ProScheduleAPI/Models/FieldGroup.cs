using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

/// <summary>
/// Logical identity of a reusable field group ("Contact Information",
/// "Address", "Insurance", "Medical History — Chiropractic"). The actual
/// fields live on <see cref="FieldGroupVersion"/> rows — this entity is
/// just the stable handle.
///
/// Tenancy:
///   - <see cref="IsGlobal"/> = true, <see cref="OwnerPracticeId"/> = null:
///     a platform-level reusable group, owned by SuperAdmins.
///   - <see cref="IsGlobal"/> = false, <see cref="OwnerPracticeId"/> = X,
///     <see cref="ParentLogicalId"/> = G: a copy-on-write override forked
///     by Practice X from global group G. Practice X's templates can
///     reference this fork directly via its own <see cref="LogicalId"/>.
///   - <see cref="IsGlobal"/> = false, <see cref="OwnerPracticeId"/> = X,
///     <see cref="ParentLogicalId"/> = null: a tenant-only group created
///     from scratch by Practice X (not derived from any global).
///
/// Versioning: every meaningful edit creates a new <see cref="FieldGroupVersion"/>
/// row with <see cref="FieldGroupVersion.Version"/> = max + 1. The current
/// "live" version pointer is <see cref="CurrentVersion"/>; templates resolve
/// references through it (or through an explicitly pinned version on a
/// FormInstance).
///
/// Soft-delete via <see cref="DeletedAt"/>. Hard delete is forbidden so
/// historical FormInstance rows always have something to render even when
/// their Snapshot fails to deserialize for some reason.
/// </summary>
public class FieldGroup
{
    /// <summary>
    /// Stable identity. A new <see cref="FieldGroupVersion"/> row preserves
    /// this Guid, so templates referencing the group survive edits.
    /// Generated client-side OR server-side; Guid avoids tenant coordination.
    /// </summary>
    public Guid LogicalId { get; set; } = Guid.NewGuid();

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Bucket for admin-UI grouping/filtering: contact, address, insurance,
    /// medical, billing, consent, custom. Free-form string by design — the
    /// admin UI offers a typeahead but doesn't constrain values, so new
    /// categories don't require a code change.
    /// </summary>
    [MaxLength(60)]
    public string? Category { get; set; }

    public bool IsGlobal { get; set; }

    /// <summary>
    /// When this row is a tenant-owned override of a global group, points
    /// at that global's <see cref="LogicalId"/>. Null otherwise.
    /// </summary>
    public Guid? ParentLogicalId { get; set; }

    /// <summary>
    /// Null when global. Set to the practice that owns this row otherwise
    /// (whether it's a fork of a global or a tenant-only original).
    /// </summary>
    public int? OwnerPracticeId { get; set; }
    public Practice? OwnerPractice { get; set; }

    /// <summary>The currently-live version number. Incremented on every save.</summary>
    public int CurrentVersion { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Soft-delete marker. Live rows have <c>DeletedAt = null</c>. Setting
    /// it hides the group from admin lists but preserves all historical
    /// versions so submitted FormInstances continue to render.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<FieldGroupVersion> Versions { get; set; } = [];
}

/// <summary>
/// Immutable snapshot of a <see cref="FieldGroup"/> at a specific version.
/// Once written, <see cref="FieldsJson"/> and the metadata fields here are
/// not updated — edits create a new row with <see cref="Version"/> = max + 1.
/// </summary>
public class FieldGroupVersion
{
    public int Id { get; set; }

    /// <summary>FK to the parent <see cref="FieldGroup.LogicalId"/>.</summary>
    public Guid FieldGroupLogicalId { get; set; }
    public FieldGroup FieldGroup { get; set; } = null!;

    /// <summary>
    /// Monotonically increasing per-LogicalId. The combination
    /// (FieldGroupLogicalId, Version) is unique.
    /// </summary>
    public int Version { get; set; }

    /// <summary>Snapshot of the group's name at this version.</summary>
    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional admin-facing description.</summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Serialized JSON array of <see cref="Field"/> objects. Stored as
    /// nvarchar(max) — the whole field array is the unit of work for both
    /// editing and rendering, so normalizing the fields into rows would
    /// just add joins without enabling any current query. Revisit per
    /// parking lot #7 if cross-field admin search becomes a need.
    /// </summary>
    public string FieldsJson { get; set; } = "[]";

    /// <summary>
    /// Group-level PHI flag. When true, every access to a FormInstance that
    /// includes this group is recorded in the audit log (see ADR-001 §10.7).
    /// </summary>
    public bool PhiFlag { get; set; } = true;

    /// <summary>
    /// Optional group-level show-if rule. Null means the group always renders.
    /// Same v1-simple shape as <see cref="FieldConditionalLogic"/>.
    /// </summary>
    public string? ConditionalLogicJson { get; set; }

    public int? CreatedByUserId { get; set; }
    public AppUser? CreatedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
