using ProScheduleAPI.Models;

namespace ProScheduleAPI.DTOs;

public record AppointmentSummaryDto(
    int Id,
    string ClientName,
    string ClientEmail,
    string ProviderName,
    string AppointmentTypeName,
    DateTime StartTime,
    DateTime EndTime,
    AppointmentStatus Status,
    bool HasIntakeResponse
);

public record AppointmentDetailDto(
    int Id,
    int ClientId,
    string ClientName,
    string ClientEmail,
    string ClientPhone,
    int ProviderId,
    string ProviderName,
    int AppointmentTypeId,
    string AppointmentTypeName,
    int DurationMinutes,
    DateTime StartTime,
    DateTime EndTime,
    AppointmentStatus Status,
    string? Notes,
    bool HasIntakeResponse,
    /// <summary>
    /// Most-recent submitted response. Kept for back-compat with the
    /// single-form rendering path; new UI consumes <see cref="IntakeResponses"/>
    /// instead so multi-form appointments show every submitted form.
    /// </summary>
    IntakeFormResponseDto? IntakeResponse,
    /// <summary>
    /// Every submitted response on this appointment, ordered most-recent
    /// first. One card per entry on the appointment detail page.
    /// </summary>
    List<IntakeFormResponseDto> IntakeResponses
);

public record CreateAppointmentRequest(
    int ProviderId,
    int AppointmentTypeId,
    DateTime StartTime,
    string ClientFirstName,
    string ClientLastName,
    string ClientEmail,
    string? ClientPhone,
    bool SmsOptIn,
    string? Notes
);

public record UpdateAppointmentRequest(
    AppointmentStatus Status,
    string? Notes
);

public record RescheduleRequest(
    string CancellationToken,
    DateTime NewStartTime
);

public record CancelRequest(string CancellationToken);

public record AvailableSlotDto(DateTime Start, DateTime End);

public record IntakeFormResponseDto(
    int Id,
    string ResponsesJson,
    DateTime SubmittedAt,
    /// <summary>
    /// The PracticeForm row this response was submitted against. Null for
    /// legacy responses that pre-date the named-forms library (those rows
    /// have a null PracticeFormId on the entity). The UI falls back to
    /// "Intake Form" when null so we never render a blank heading.
    /// </summary>
    string? FormName,
    int? PracticeFormId
);

/// <summary>
/// One attached form on a client's appointment, with completion status
/// derived from whether an IntakeFormResponse exists for it on this
/// appointment. Surfaced on the "My Appointments" page so the client can
/// see at a glance which paperwork is still outstanding.
/// </summary>
public record MyAppointmentFormDto(
    int Id,
    string Name,
    bool Completed
);

/// <summary>
/// Appointment summary as shown to a signed-in client on their
/// "My Appointments" page. Includes both display names (for the list)
/// AND ids (for the Modify booking flow's pre-selection of the original
/// type/provider).
/// </summary>
public record MyAppointmentDto(
    int Id,
    string PracticeName,
    string PracticeSlug,
    int ProviderId,
    string ProviderName,
    int AppointmentTypeId,
    string AppointmentTypeName,
    DateTime StartTime,
    DateTime EndTime,
    AppointmentStatus Status,
    string? CancellationToken,
    /// <summary>
    /// Forms attached to the appointment's type, ordered by SortOrder, each
    /// flagged as Completed when the client has submitted a matching
    /// IntakeFormResponse. Empty when no forms are attached.
    /// </summary>
    List<MyAppointmentFormDto> Forms,
    /// <summary>Street address line 1 of the practice (where the client goes). Null if unset.</summary>
    string? AddressLine1,
    string? City,
    string? State,
    string? PostalCode
);
