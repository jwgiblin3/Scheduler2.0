namespace ProScheduleAPI.DTOs;

public record ProviderDto(
    int Id,
    string DisplayName,
    string? Email,
    string? Phone,
    string? Bio,
    bool IsActive,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record CreateProviderRequest(
    string DisplayName,
    string? Email,
    string? Phone,
    string? Bio,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record UpdateProviderRequest(
    string DisplayName,
    string? Email,
    string? Phone,
    string? Bio,
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
