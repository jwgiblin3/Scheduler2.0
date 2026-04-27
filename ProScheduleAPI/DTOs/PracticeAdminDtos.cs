namespace ProScheduleAPI.DTOs;

/// <summary>
/// SuperAdmin-facing summary of a practice tenant. Includes computed counts
/// useful for the cross-tenant browser. Read-only — there's no SuperAdmin
/// edit path on this DTO; admins use practice-side endpoints (impersonating
/// the tenant) for any actual changes.
/// </summary>
public record PracticeAdminSummaryDto(
    int Id,
    string Name,
    string Slug,
    string AdminEmail,
    string? Phone,
    string? Website,
    string? AddressSummary,
    DateTime CreatedAt,
    int UserCount,
    int ProviderCount,
    int ClientCount,
    int AppointmentCount,
    int LegacyFormCount,
    int OverrideGroupCount,
    int OverrideTemplateCount
);
