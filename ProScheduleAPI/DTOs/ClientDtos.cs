namespace ProScheduleAPI.DTOs;

public record ClientDto(
    int Id,
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    bool SmsOptIn,
    DateTime CreatedAt,
    int AppointmentCount,
    DateTime? LastAppointment
);

/// <summary>Admin edit payload — limited to fields a practice admin can safely change.</summary>
public record UpdateClientRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    bool SmsOptIn
);

/// <summary>One appointment line on a client's detail page.</summary>
public record ClientAppointmentDto(
    int Id,
    DateTime StartTime,
    DateTime EndTime,
    string ProviderName,
    string AppointmentTypeName,
    int Status,
    bool HasIntakeResponse
);

/// <summary>One submitted form response shown on a client's detail page.</summary>
public record ClientFormResponseDto(
    int Id,
    int AppointmentId,
    DateTime AppointmentStartTime,
    int? PracticeFormId,
    string FormName,
    DateTime SubmittedAt,
    string ResponsesJson,
    string FieldsJson
);

/// <summary>Full client detail — profile + appointments + form responses.</summary>
public record ClientDetailDto(
    int Id,
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    bool SmsOptIn,
    DateTime CreatedAt,
    List<ClientAppointmentDto> Appointments,
    List<ClientFormResponseDto> FormResponses
);

/// <summary>A form from a practice's Forms library.</summary>
public record PracticeFormDto(
    int Id,
    string Name,
    string FieldsJson,
    DateTime UpdatedAt
);

public record SavePracticeFormRequest(
    string Name,
    string FieldsJson
);

public record SubmitIntakeFormRequest(
    int AppointmentId,
    string CancellationToken,
    string ResponsesJson,
    /// <summary>
    /// Which form in the library the client is submitting. Optional for
    /// backwards-compatibility with older booking flows that pre-date the
    /// library and always submitted the single form attached to the type.
    /// </summary>
    int? PracticeFormId = null
);
