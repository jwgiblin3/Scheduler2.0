using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

/// <summary>
/// Practice-accessible read of global field groups. Distinct from the
/// SuperAdmin-only /api/admin/field-groups CRUD: this endpoint is what
/// practice-admin form editors hit when offering a "+ Add field group"
/// picker. Read-only, returns the current version's fields so the picker
/// can show a preview and the editor can drop the fields in-line.
///
/// Authorization: any signed-in user. Tightening this to PracticeAdmin
/// would block FrontDesk from seeing the picker — that's fine if/when we
/// gate form authoring to Admin only, but today FormsController only
/// requires the Admin role for write paths so we mirror that here (read
/// is open to any signed-in user).
/// </summary>
[ApiController]
[Route("api/field-groups")]
[Authorize]
public class FieldGroupsBrowseController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public FieldGroupsBrowseController(AppDbContext db) => _db = db;

    /// <summary>
    /// List global, non-deleted field groups with the field array from
    /// each group's current version. Optional category filter.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<FieldGroupDetailDto>>> ListGlobals(
        [FromQuery] string? category = null)
    {
        var groupsQ = _db.FieldGroups
            .Where(g => g.IsGlobal && g.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(category))
            groupsQ = groupsQ.Where(g => g.Category == category);

        var groups = await groupsQ
            .OrderBy(g => g.Category).ThenBy(g => g.Name)
            .ToListAsync();

        // Pull each group's current version row in one batched query.
        var keys = groups.Select(g => new { g.LogicalId, g.CurrentVersion }).ToList();
        var versionLogicalIds = keys.Select(k => k.LogicalId).ToHashSet();
        var versions = await _db.FieldGroupVersions
            .Where(v => versionLogicalIds.Contains(v.FieldGroupLogicalId))
            .ToListAsync();

        var result = new List<FieldGroupDetailDto>();
        foreach (var g in groups)
        {
            var v = versions.FirstOrDefault(x =>
                x.FieldGroupLogicalId == g.LogicalId && x.Version == g.CurrentVersion);
            var fields = v is null ? new List<FieldDto>() : DeserializeFields(v.FieldsJson);
            result.Add(new FieldGroupDetailDto(
                g.LogicalId, g.Name, g.Category, g.IsGlobal,
                g.OwnerPracticeId, g.ParentLogicalId, g.CurrentVersion,
                v?.Description, v?.PhiFlag ?? true,
                fields, g.UpdatedAt, g.DeletedAt != null));
        }
        return Ok(result);
    }

    private static List<FieldDto> DeserializeFields(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
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
        catch
        {
            // Tolerate corrupt JSON rather than 500ing the whole list — surface
            // an empty field array for the offending group; the picker UI
            // still shows the group with a "(no fields)" badge.
            return new();
        }
    }
}
