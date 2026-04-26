using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

/// <summary>
/// Logical identity of a form template. Templates are ordered collections
/// of (group references) and (standalone fields) — the actual ordering and
/// content lives on <see cref="FormTemplateVersion"/> rows.
///
/// Tenancy semantics mirror <see cref="FieldGroup"/>:
///   - Global templates: <c>IsGlobal=true, OwnerPracticeId=null</c>.
///   - Tenant fork of a global: <c>IsGlobal=false, OwnerPracticeId=X,
///     ParentLogicalId=&lt;global&gt;</c>.
///   - Tenant-only original: <c>IsGlobal=false, OwnerPracticeId=X,
///     ParentLogicalId=null</c>.
///
/// <see cref="TargetAudience"/> tags which vertical the template fits
/// ("chiro", "massage", "pt", "generic"). The admin UI filters by it; the
/// data model doesn't enforce that a Chiro practice can't attach a
/// "massage" template — multi-vertical practices are parking lot #11.
/// </summary>
public class FormTemplate
{
    public Guid LogicalId { get; set; } = Guid.NewGuid();

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// "chiro" | "massage" | "pt" | "generic". Free-form by design (see
    /// FieldGroup.Category for the same reasoning).
    /// </summary>
    [MaxLength(40)]
    public string TargetAudience { get; set; } = "generic";

    public bool IsGlobal { get; set; }

    public Guid? ParentLogicalId { get; set; }

    public int? OwnerPracticeId { get; set; }
    public Practice? OwnerPractice { get; set; }

    public int CurrentVersion { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Soft-delete marker (see <see cref="FieldGroup.DeletedAt"/>).</summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<FormTemplateVersion> Versions { get; set; } = [];
}

/// <summary>
/// Immutable snapshot of a <see cref="FormTemplate"/> at a specific version.
/// </summary>
public class FormTemplateVersion
{
    public int Id { get; set; }

    public Guid FormTemplateLogicalId { get; set; }
    public FormTemplate FormTemplate { get; set; } = null!;

    public int Version { get; set; }

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Ordered JSON list of <see cref="FormTemplateItem"/>. Mix of group
    /// references (which point at a specific FieldGroup version) and
    /// standalone <see cref="Field"/> objects (which live directly on the
    /// template, not inside any group). Stored as nvarchar(max).
    /// </summary>
    public string ItemsJson { get; set; } = "[]";

    public int? CreatedByUserId { get; set; }
    public AppUser? CreatedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// One entry in <see cref="FormTemplateVersion.ItemsJson"/>. POCO; not a
/// DB entity. Discriminated by <see cref="Kind"/> = "group" or "field".
/// </summary>
public class FormTemplateItem
{
    /// <summary>"group" or "field".</summary>
    public string Kind { get; set; } = "field";

    // --- Group reference fields (when Kind == "group") ---

    /// <summary>The <see cref="FieldGroup.LogicalId"/> this item references.</summary>
    public Guid? GroupLogicalId { get; set; }

    /// <summary>The pinned version. The renderer resolves this exact row.</summary>
    public int? GroupVersion { get; set; }

    // --- Standalone field (when Kind == "field") ---

    /// <summary>Inline field definition for templates that need a one-off.</summary>
    public Field? Field { get; set; }
}
