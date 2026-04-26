using ProScheduleAPI.Models;

namespace ProScheduleAPI.DTOs;

/// <summary>
/// One row in the field-group list. Doesn't include the field array — that's
/// a detail-screen concern. Keeps the list endpoint cheap even when the
/// platform has hundreds of groups.
/// </summary>
public record FieldGroupListItemDto(
    Guid LogicalId,
    string Name,
    string? Category,
    bool IsGlobal,
    int? OwnerPracticeId,
    Guid? ParentLogicalId,
    int CurrentVersion,
    DateTime UpdatedAt,
    bool Deleted
);

/// <summary>
/// Full detail of a field group, including the current version's fields.
/// </summary>
public record FieldGroupDetailDto(
    Guid LogicalId,
    string Name,
    string? Category,
    bool IsGlobal,
    int? OwnerPracticeId,
    Guid? ParentLogicalId,
    int CurrentVersion,
    string? Description,
    bool PhiFlag,
    List<FieldDto> Fields,
    DateTime UpdatedAt,
    bool Deleted
);

/// <summary>
/// One historical version row. Used by the version-history accordion on the
/// detail screen so admins can see when a group changed and (in the future)
/// inspect older versions.
/// </summary>
public record FieldGroupVersionSummaryDto(
    int Id,
    int Version,
    string Name,
    string? Description,
    bool PhiFlag,
    int? CreatedByUserId,
    DateTime CreatedAt
);

/// <summary>
/// Wire shape of a Field. Mirrors the <see cref="Field"/> POCO. We keep it
/// as a record rather than reusing the model directly so changes to the
/// model don't accidentally break the API contract.
/// </summary>
public record FieldDto(
    string? Id,
    FieldType Type,
    string Label,
    string? Placeholder,
    string? HelpText,
    bool Required,
    FieldWidth Width,
    int? MaxLength,
    int? MinLength,
    string? Pattern,
    List<FieldOptionDto>? Options,
    bool PhiFlag,
    FieldConditionalLogicDto? ConditionalLogic
);

public record FieldOptionDto(string Value, string Label);

public record FieldConditionalLogicDto(string SourceFieldId, string Operator, string Value);

/// <summary>
/// Request to create a new global field group. Always creates v1.
/// </summary>
public record CreateFieldGroupRequest(
    string Name,
    string? Category,
    string? Description,
    bool PhiFlag,
    List<FieldDto> Fields
);

/// <summary>
/// Request to update a field group. Always creates a new version row —
/// callers don't manage version numbers, the server bumps them. The
/// version that gets created is <c>CurrentVersion + 1</c>.
/// </summary>
public record UpdateFieldGroupRequest(
    string Name,
    string? Category,
    string? Description,
    bool PhiFlag,
    List<FieldDto> Fields
);
