namespace ProScheduleAPI.DTOs;

public record ProviderDto(
    int Id,
    string DisplayName,
    string? Email,
    string? Phone,
    string? Description,
    bool IsActive,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record CreateProviderRequest(
    string DisplayName,
    string? Email,
    string? Phone,
    string? Description,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record UpdateProviderRequest(
    string DisplayName,
    string? Email,
    string? Phone,
    string? Description,
    bool IsActive,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record AvailabilityDto(
    int? Id,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsActive
);
