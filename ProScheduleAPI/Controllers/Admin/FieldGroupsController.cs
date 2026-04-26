using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers.Admin;

/// <summary>
/// SuperAdmin-only CRUD for global field groups. Practice-level overrides
/// (copy-on-write tenant forks) ship in a later phase via a separate
/// endpoint set; this controller manages globals only.
///
/// Versioning: every save creates a new <see cref="FieldGroupVersion"/>
/// row. <see cref="FieldGroup.CurrentVersion"/> moves forward to point at
/// it. Older versions stay in the DB so historical FormInstances continue
/// to render. There is no "delete a version" — only soft-delete the entire
/// group.
/// </summary>
[ApiController]
[Route("api/admin/field-groups")]
[Authorize(Policy = "ManageGlobals")]
public class FieldGroupsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public FieldGroupsController(AppDbContext db, IAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    /// <summary>
    /// List every global field group. Optional <paramref name="category"/>
    /// filter is exact match. Soft-deleted rows are excluded by default;
    /// pass <paramref name="includeDeleted"/> = true to see them.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<FieldGroupListItemDto>>> List(
        [FromQuery] string? category = null,
        [FromQuery] bool includeDeleted = false)
    {
        var q = _db.FieldGroups.Where(g => g.IsGlobal);
        if (!includeDeleted) q = q.Where(g => g.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(g => g.Category == category);

        var rows = await q
            .OrderBy(g => g.Category).ThenBy(g => g.Name)
            .Select(g => new FieldGroupListItemDto(
                g.LogicalId, g.Name, g.Category, g.IsGlobal,
                g.OwnerPracticeId, g.ParentLogicalId, g.CurrentVersion,
                g.UpdatedAt, g.DeletedAt != null))
            .ToListAsync();
        return Ok(rows);
    }

    /// <summary>
    /// Full detail including the field array from the current version.
    /// </summary>
    [HttpGet("{logicalId:guid}")]
    public async Task<ActionResult<FieldGroupDetailDto>> Get(Guid logicalId)
    {
        var group = await _db.FieldGroups
            .FirstOrDefaultAsync(g => g.LogicalId == logicalId && g.IsGlobal);
        if (group is null) return NotFound();

        var current = await _db.FieldGroupVersions
            .FirstOrDefaultAsync(v =>
                v.FieldGroupLogicalId == logicalId && v.Version == group.CurrentVersion);

        var fields = current is null
            ? new List<FieldDto>()
            : DeserializeFields(current.FieldsJson);

        return Ok(new FieldGroupDetailDto(
            group.LogicalId, group.Name, group.Category, group.IsGlobal,
            group.OwnerPracticeId, group.ParentLogicalId, group.CurrentVersion,
            current?.Description, current?.PhiFlag ?? true,
            fields, group.UpdatedAt, group.DeletedAt != null));
    }

    /// <summary>
    /// Version history for a single group. Most-recent first.
    /// </summary>
    [HttpGet("{logicalId:guid}/versions")]
    public async Task<ActionResult<List<FieldGroupVersionSummaryDto>>> Versions(Guid logicalId)
    {
        var versions = await _db.FieldGroupVersions
            .Where(v => v.FieldGroupLogicalId == logicalId)
            .OrderByDescending(v => v.Version)
            .Select(v => new FieldGroupVersionSummaryDto(
                v.Id, v.Version, v.Name, v.Description,
                v.PhiFlag, v.CreatedByUserId, v.CreatedAt))
            .ToListAsync();
        return Ok(versions);
    }

    /// <summary>Create a new global group at version 1.</summary>
    [HttpPost]
    public async Task<ActionResult<FieldGroupDetailDto>> Create(CreateFieldGroupRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var userId = TryGetUserId();

        var group = new FieldGroup
        {
            LogicalId = Guid.NewGuid(),
            Name = req.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim(),
            IsGlobal = true,
            ParentLogicalId = null,
            OwnerPracticeId = null,
            CurrentVersion = 1
        };
        var version = new FieldGroupVersion
        {
            FieldGroupLogicalId = group.LogicalId,
            Version = 1,
            Name = group.Name,
            Description = req.Description?.Trim(),
            PhiFlag = req.PhiFlag,
            FieldsJson = SerializeFields(req.Fields ?? new List<FieldDto>()),
            CreatedByUserId = userId
        };

        _db.FieldGroups.Add(group);
        _db.FieldGroupVersions.Add(version);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Create,
            entityType: nameof(FieldGroup),
            entityId: group.LogicalId.ToString(),
            note: $"Created global group '{group.Name}' v1");

        return CreatedAtAction(nameof(Get), new { logicalId = group.LogicalId },
            await BuildDetail(group, version));
    }

    /// <summary>
    /// Update a global group. Always creates a new version row (current + 1)
    /// and bumps <see cref="FieldGroup.CurrentVersion"/>. The previous
    /// version row stays untouched in the DB.
    /// </summary>
    [HttpPut("{logicalId:guid}")]
    public async Task<ActionResult<FieldGroupDetailDto>> Update(
        Guid logicalId, UpdateFieldGroupRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var group = await _db.FieldGroups
            .FirstOrDefaultAsync(g => g.LogicalId == logicalId && g.IsGlobal);
        if (group is null) return NotFound();
        if (group.DeletedAt != null) return BadRequest("Group is deleted.");

        var userId = TryGetUserId();
        var nextVersion = group.CurrentVersion + 1;

        // Detect what's changing for the audit row's ChangedFields. Compare
        // to the previous current-version row.
        var prev = await _db.FieldGroupVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(v =>
                v.FieldGroupLogicalId == logicalId && v.Version == group.CurrentVersion);
        var changedFields = DiffFields(group, prev, req);

        // Apply group-level edits.
        group.Name = req.Name.Trim();
        group.Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim();
        group.CurrentVersion = nextVersion;
        group.UpdatedAt = DateTime.UtcNow;

        var version = new FieldGroupVersion
        {
            FieldGroupLogicalId = group.LogicalId,
            Version = nextVersion,
            Name = group.Name,
            Description = req.Description?.Trim(),
            PhiFlag = req.PhiFlag,
            FieldsJson = SerializeFields(req.Fields ?? new List<FieldDto>()),
            CreatedByUserId = userId
        };
        _db.FieldGroupVersions.Add(version);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Update,
            entityType: nameof(FieldGroup),
            entityId: group.LogicalId.ToString(),
            changedFields: changedFields,
            note: $"Updated global group '{group.Name}' to v{nextVersion}");

        return Ok(await BuildDetail(group, version));
    }

    /// <summary>
    /// Soft-delete. Sets <see cref="FieldGroup.DeletedAt"/>; existing
    /// versions stay so historical FormInstances render. Hard delete is
    /// not exposed.
    /// </summary>
    [HttpDelete("{logicalId:guid}")]
    public async Task<IActionResult> SoftDelete(Guid logicalId)
    {
        var group = await _db.FieldGroups
            .FirstOrDefaultAsync(g => g.LogicalId == logicalId && g.IsGlobal);
        if (group is null) return NotFound();
        if (group.DeletedAt != null) return NoContent();

        group.DeletedAt = DateTime.UtcNow;
        group.UpdatedAt = group.DeletedAt.Value;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Delete,
            entityType: nameof(FieldGroup),
            entityId: group.LogicalId.ToString(),
            note: $"Soft-deleted global group '{group.Name}'");

        return NoContent();
    }

    // --- helpers ---

    private async Task<FieldGroupDetailDto> BuildDetail(FieldGroup g, FieldGroupVersion v)
    {
        await Task.CompletedTask;
        return new FieldGroupDetailDto(
            g.LogicalId, g.Name, g.Category, g.IsGlobal,
            g.OwnerPracticeId, g.ParentLogicalId, g.CurrentVersion,
            v.Description, v.PhiFlag,
            DeserializeFields(v.FieldsJson),
            g.UpdatedAt, g.DeletedAt != null);
    }

    private int? TryGetUserId()
    {
        var raw = User.FindFirstValue("userId") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : null;
    }

    private static string SerializeFields(List<FieldDto> fields)
    {
        // Materialize each FieldDto into a Field POCO so the on-disk JSON
        // matches the model's wire shape exactly (avoids a future field
        // becoming visible in the wire DTO but not the persisted form).
        var list = fields.Select(f => new Field
        {
            Id = string.IsNullOrWhiteSpace(f.Id) ? Guid.NewGuid().ToString("N")[..8] : f.Id,
            Type = f.Type,
            Label = f.Label ?? string.Empty,
            Placeholder = f.Placeholder,
            HelpText = f.HelpText,
            Required = f.Required,
            Width = f.Width,
            MaxLength = f.MaxLength,
            MinLength = f.MinLength,
            Pattern = f.Pattern,
            Options = f.Options?.Select(o => new FieldOption { Value = o.Value, Label = o.Label }).ToList(),
            PhiFlag = f.PhiFlag,
            ConditionalLogic = f.ConditionalLogic is null ? null : new FieldConditionalLogic
            {
                SourceFieldId = f.ConditionalLogic.SourceFieldId,
                Operator = f.ConditionalLogic.Operator,
                Value = f.ConditionalLogic.Value
            }
        }).ToList();
        return JsonSerializer.Serialize(list, JsonOpts);
    }

    private static List<FieldDto> DeserializeFields(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        var list = JsonSerializer.Deserialize<List<Field>>(json, JsonOpts) ?? new();
        return list.Select(f => new FieldDto(
            f.Id, f.Type, f.Label, f.Placeholder, f.HelpText, f.Required, f.Width,
            f.MaxLength, f.MinLength, f.Pattern,
            f.Options?.Select(o => new FieldOptionDto(o.Value, o.Label)).ToList(),
            f.PhiFlag,
            f.ConditionalLogic is null ? null
                : new FieldConditionalLogicDto(
                    f.ConditionalLogic.SourceFieldId,
                    f.ConditionalLogic.Operator,
                    f.ConditionalLogic.Value))).ToList();
    }

    /// <summary>
    /// Build the changed-field-names list for the audit row. Compares
    /// group-level metadata + a count-and-id-set of the field array. Never
    /// includes field VALUES — see ADR-001 §10.7.
    /// </summary>
    private static List<string> DiffFields(
        FieldGroup oldGroup, FieldGroupVersion? oldVersion, UpdateFieldGroupRequest req)
    {
        var changes = new List<string>();
        if (oldGroup.Name != req.Name?.Trim()) changes.Add(nameof(FieldGroup.Name));
        if ((oldGroup.Category ?? "") != (req.Category?.Trim() ?? "")) changes.Add(nameof(FieldGroup.Category));
        if (oldVersion is not null)
        {
            if ((oldVersion.Description ?? "") != (req.Description?.Trim() ?? ""))
                changes.Add(nameof(FieldGroupVersion.Description));
            if (oldVersion.PhiFlag != req.PhiFlag)
                changes.Add(nameof(FieldGroupVersion.PhiFlag));
        }
        // We always treat field-array changes as a single "Fields" delta
        // rather than per-field diffs — admins update the whole array
        // anyway, and the per-field diff would explode the audit row.
        changes.Add("Fields");
        return changes;
    }
}
