namespace ProScheduleAPI.DTOs;

public record ClientDto(
    int Id,
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    bool SmsOptIn,
    DateTime CreatedAt
);

public record IntakeFormDto(
    int Id,
    int AppointmentTypeId,
    string Title,
    string FieldsJson
);

public record SaveIntakeFormRequest(
    string Title,
    string FieldsJson
);

public record SubmitIntakeFormRequest(
    int AppointmentId,
    string CancellationToken,
    string ResponsesJson
);
