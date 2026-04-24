namespace ProScheduleAPI.DTOs;

public record AppointmentTypeDto(
    int Id,
    string Name,
    string? Description,
    int DurationMinutes,
    int BufferBeforeMinutes,
    int BufferAfterMinutes,
    bool RequiresIntakeForm,
    bool IsActive,
    /// <summary>IDs of forms from the practice library attached to this type, in display order.</summary>
    int[] FormIds
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
    bool IsActive,
    /// <summary>
    /// Full replacement of the attached forms list, in the order they should
    /// be presented to the client. Omit (null) to leave the current attachments
    /// untouched — useful when only the basic type fields changed.
    /// </summary>
    int[]? FormIds = null
);
