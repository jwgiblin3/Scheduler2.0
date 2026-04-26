using ProScheduleAPI.Models;

namespace ProScheduleAPI.DTOs;

/// <summary>
/// One row in the audit log browser. Joins on AppUser to surface a
/// readable name/email rather than just the user id.
/// </summary>
public record AuditLogRowDto(
    long Id,
    DateTime Timestamp,
    int? UserId,
    string? UserEmail,
    string? UserName,
    string? Role,
    string? IpAddress,
    AuditAction Action,
    string EntityType,
    string EntityId,
    int? PracticeId,
    string? PracticeName,
    List<string>? ChangedFields,
    string? Note
);

/// <summary>
/// Paginated response. <c>Total</c> is the total row count matching the
/// filter (NOT just the current page) so the UI can render "page X of Y".
/// </summary>
public record AuditLogPageDto(
    long Total,
    int Page,
    int PageSize,
    List<AuditLogRowDto> Rows
);
