namespace ProScheduleAPI.DTOs;

public record AppointmentTypeDto(
    int Id,
    string Name,
    string? Description,
    int DurationMinutes,
    int BufferBeforeMinutes,
    int BufferAfterMinutes,
    bool RequiresIntakeForm,
    bool IsActive
);

public record CreateAppointmentTypeRequest(
    string Name,
    string? Description,
    int DurationMinutes,
    int BufferBeforeMinutes,
    int BufferAfterMinutes,
    bool RequiresIntakeForm
);

public record UpdateAppointmentTypeRequest(
    string Name,
    string? Description,
    int DurationMinutes,
    int BufferBeforeMinutes,
    int BufferAfterMinutes,
    bool RequiresIntakeForm,
    bool IsActive
);
