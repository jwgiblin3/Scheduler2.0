namespace ProScheduleAPI.Models;

/// <summary>
/// A single form field. NOT a top-level entity — Fields are embedded inside
/// FieldGroupVersion.FieldsJson (when they belong to a group) and inside
/// FormTemplateVersion.ItemsJson (when they're standalone fields directly
/// on a template, not inside any group).
///
/// Replaces the legacy <see cref="IntakeFormField"/> POCO with a richer
/// shape: width-driven layout, validation bounds, PHI flag, conditional
/// logic, structured options. Legacy IntakeFormField stays alongside it
/// during the migration period (Phase 2 → Phase 6) so old PracticeForm
/// rows still render.
///
/// Stable across versions: <see cref="Id"/> is a short string assigned
/// when the field is created and preserved across group-version edits.
/// Renaming a label or changing its width DOES NOT change the Id —
/// existing FormInstance.ResponsesJson rows keep their answer for the
/// same field across template/group version bumps.
/// </summary>
public class Field
{
    /// <summary>
    /// Stable per-field identifier. Format is intentionally opaque
    /// (8-char hex) so callers don't accidentally treat it as an int.
    /// </summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    /// <summary>What kind of input this renders to.</summary>
    public FieldType Type { get; set; } = FieldType.Text;

    /// <summary>The label shown to the patient/client above the input.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Optional placeholder text inside the input.</summary>
    public string? Placeholder { get; set; }

    /// <summary>Optional help text shown below the input (small grey copy).</summary>
    public string? HelpText { get; set; }

    /// <summary>Whether the field is required for submission.</summary>
    public bool Required { get; set; }

    /// <summary>
    /// Layout hint. The renderer flows fields into a CSS grid and uses this
    /// to decide how many columns a field spans. Always wins over any
    /// stylistic preference of the admin — there is intentionally no
    /// raw-HTML or inline-CSS escape hatch.
    /// </summary>
    public FieldWidth Width { get; set; } = FieldWidth.Full;

    /// <summary>Max character count for text-shaped inputs. Null = no cap.</summary>
    public int? MaxLength { get; set; }

    /// <summary>Min character count for text-shaped inputs. Null = no minimum.</summary>
    public int? MinLength { get; set; }

    /// <summary>Optional regex pattern (anchor with ^...$ if you want full match).</summary>
    public string? Pattern { get; set; }

    /// <summary>
    /// Options for select / multiselect / radio / checkbox-group fields.
    /// Ignored for other types. Each option carries both the stable Value
    /// (stored in responses) and the human Label (shown in UI).
    /// </summary>
    public List<FieldOption>? Options { get; set; }

    /// <summary>
    /// PHI flag. Drives display logic (lock icons, redaction in screenshots,
    /// audit-log routing). Even when this is false on the field, the
    /// containing group's PHI flag is the operative one for audit purposes
    /// — we audit groups/forms, not individual fields. See ADR-001 §10.7.
    /// </summary>
    public bool PhiFlag { get; set; }

    /// <summary>
    /// Optional show-if rule. v1 supports a single condition only — no AND/OR
    /// composition (parking lot #5). Null means the field is always shown.
    /// </summary>
    public FieldConditionalLogic? ConditionalLogic { get; set; }
}

/// <summary>
/// Field input types. Renderer maps each to a control. New types must be
/// added here AND wired into the renderer in Phase 5; otherwise an unknown
/// type falls back to a plain text input with a console warning.
/// </summary>
public enum FieldType
{
    Text = 0,
    Textarea = 1,
    Email = 2,
    Phone = 3,
    Number = 4,
    Date = 5,
    Time = 6,
    DateTime = 7,
    Select = 8,
    Multiselect = 9,
    Radio = 10,
    Checkbox = 11,            // single yes/no
    CheckboxGroup = 12,       // multi-pick from Options
    Signature = 13,           // typed name + audit (not a drawn canvas; see parking lot #2)
    File = 14,                // tied to FileBlob via FileBlobId in response
    BodyDiagram = 15,         // image-map component already in the codebase (parking lot #17)
    AddressBlock = 16,        // composite — renders as line1/line2/city/state/zip
    PaymentMethod = 17        // RESERVED: tokenized payment iframe. Tabled in v1 (parking lot #1).
}

/// <summary>
/// Layout width. Renderer uses Full = 1 column, Half = 2, Third = 3, Quarter = 4.
/// </summary>
public enum FieldWidth
{
    Full = 0,
    Half = 1,
    Third = 2,
    Quarter = 3
}

/// <summary>
/// One choice inside a select / radio / checkbox-group. Value is what's
/// stored in the response; Label is what the user sees.
/// </summary>
public class FieldOption
{
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

/// <summary>
/// Single show-if rule. The field is rendered only when the referenced
/// field's value equals the expected value. v1 has no AND/OR; multi-rule
/// composition is parking lot #5.
/// </summary>
public class FieldConditionalLogic
{
    /// <summary>The Field.Id whose value drives the show/hide decision.</summary>
    public string SourceFieldId { get; set; } = string.Empty;

    /// <summary>Comparison: "equals" is the only operator in v1.</summary>
    public string Operator { get; set; } = "equals";

    /// <summary>The value to compare against. String form; renderer coerces.</summary>
    public string Value { get; set; } = string.Empty;
}
