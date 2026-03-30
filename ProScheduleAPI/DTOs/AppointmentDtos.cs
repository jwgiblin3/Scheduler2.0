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
    IntakeFormResponseDto? IntakeResponse
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

public record IntakeFormResponseDto(int Id, string ResponsesJson, DateTime SubmittedAt);
