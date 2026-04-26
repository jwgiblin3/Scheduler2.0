using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

/// <summary>
/// A specific filling-out of a form by a client for a specific appointment.
/// Replaces (long-term) the legacy <see cref="IntakeFormResponse"/>; both
/// coexist during the migration period.
///
/// Pin-once-render-forever model:
///   - At creation, the instance pins <see cref="FormTemplateVersionId"/>
///     plus a map of group LogicalId → version in <see cref="PinnedGroupVersionsJson"/>.
///     The combination is what the patient sees.
///   - Once <see cref="Status"/> = Submitted, the instance is frozen.
///     <see cref="Snapshot"/> holds the fully-expanded template + group
///     definitions inline so render works even if the original template /
///     group rows are later deleted.
///   - In-flight (Pending / InProgress) instances retain their pinned
///     versions even if the underlying template/group is edited mid-flight.
///     Editing the template creates a *new* version row; the in-flight
///     instance keeps pointing at the older one.
/// </summary>
public class FormInstance
{
    public int Id { get; set; }

    public int AppointmentId { get; set; }
    public Appointment Appointment { get; set; } = null!;

    /// <summary>The exact template version the client is filling in.</summary>
    public int FormTemplateVersionId { get; set; }
    public FormTemplateVersion FormTemplateVersion { get; set; } = null!;

    /// <summary>
    /// JSON dictionary of <c>{ groupLogicalId: groupVersion }</c>. Resolved
    /// alongside the template version when rendering an in-flight instance.
    /// Pinned at creation time; never updated.
    /// </summary>
    public string PinnedGroupVersionsJson { get; set; } = "{}";

    public FormInstanceStatus Status { get; set; } = FormInstanceStatus.Pending;

    /// <summary>
    /// JSON dictionary of <c>{ fieldId: answer }</c>. Answers are
    /// type-mixed: strings, arrays (multiselect), file-blob ids,
    /// signature payloads, body-diagram coordinates. The renderer/parser
    /// is responsible for understanding each field's expected shape.
    /// </summary>
    public string ResponsesJson { get; set; } = "{}";

    /// <summary>
    /// Denormalized fully-expanded template+groups+fields, written at
    /// submit time. Used to render submitted instances even if the
    /// template/group rows are later soft-deleted or the JSON shape
    /// evolves. Null until <see cref="Status"/> = Submitted.
    /// </summary>
    public string? Snapshot { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set only when <see cref="Status"/> transitions to Submitted.</summary>
    public DateTime? SubmittedAt { get; set; }

    /// <summary>
    /// IP address captured at submission time, used as part of the
    /// e-signature audit trail per ADR-001 §10.4.
    /// </summary>
    [MaxLength(64)]
    public string? SubmissionIp { get; set; }
}

/// <summary>
/// Lifecycle of a <see cref="FormInstance"/>.
/// </summary>
public enum FormInstanceStatus
{
    /// <summary>Created but the patient hasn't opened it yet.</summary>
    Pending = 0,
    /// <summary>Patient has started filling it in but not submitted.</summary>
    InProgress = 1,
    /// <summary>Submitted and frozen. <see cref="FormInstance.Snapshot"/> populated.</summary>
    Submitted = 2,
    /// <summary>Cancelled / voided before submission. Kept for audit, not rendered.</summary>
    Voided = 3
}
