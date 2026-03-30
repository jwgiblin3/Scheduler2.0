namespace ProScheduleAPI.DTOs;

public record ProviderDto(
    int Id,
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Bio,
    bool IsActive,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record CreateProviderRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Bio,
    List<AvailabilityDto> Availabilities,
    List<int> AppointmentTypeIds
);

public record UpdateProviderRequest(
    string FirstName,
    string LastName,
    string Email,
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
