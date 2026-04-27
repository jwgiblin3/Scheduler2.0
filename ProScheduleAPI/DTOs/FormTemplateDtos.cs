namespace ProScheduleAPI.DTOs;

/// <summary>
/// One row in the form-template list. No items array — that's a detail-screen
/// concern, kept out of the list to keep it cheap.
/// </summary>
public record FormTemplateListItemDto(
    Guid LogicalId,
    string Name,
    string TargetAudience,
    bool IsGlobal,
    int? OwnerPracticeId,
    Guid? ParentLogicalId,
    int CurrentVersion,
    int ItemCount,
    DateTime UpdatedAt,
    bool Deleted
);

/// <summary>Full detail of a template, including the current version's ordered items.</summary>
public record FormTemplateDetailDto(
    Guid LogicalId,
    string Name,
    string TargetAudience,
    bool IsGlobal,
    int? OwnerPracticeId,
    Guid? ParentLogicalId,
    int CurrentVersion,
    List<FormTemplateItemDto> Items,
    DateTime UpdatedAt,
    bool Deleted
);

/// <summary>
/// One entry in <c>FormTemplateVersion.ItemsJson</c>. Discriminated by
/// <see cref="Kind"/> = "group" or "field". Mirrors the C# POCO
/// <see cref="ProScheduleAPI.Models.FormTemplateItem"/>.
/// </summary>
public record FormTemplateItemDto(
    string Kind,
    Guid? GroupLogicalId,
    int? GroupVersion,
    /// <summary>
    /// Snapshot of the referenced group's name at the time the item was
    /// added. Server populates on read so the UI doesn't have to round-trip
    /// for it — the source of truth is still the FieldGroup row.
    /// </summary>
    string? GroupName,
    /// <summary>Server-populated count of fields in the referenced group version.</summary>
    int? GroupFieldCount,
    /// <summary>Inline field definition when <see cref="Kind"/> = "field".</summary>
    FieldDto? Field
);

public record CreateFormTemplateRequest(
    string Name,
    string TargetAudience,
    List<FormTemplateItemDto> Items
);

public record UpdateFormTemplateRequest(
    string Name,
    string TargetAudience,
    List<FormTemplateItemDto> Items
);
