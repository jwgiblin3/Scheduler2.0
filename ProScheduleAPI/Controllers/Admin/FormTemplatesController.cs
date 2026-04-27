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
/// SuperAdmin-only CRUD for global form templates. Practice-level forks
/// (copy-on-write tenant overrides) ship in a later phase via a separate
/// endpoint set; this controller manages globals only.
///
/// Versioning works like FieldGroups: every save creates a new
/// <see cref="FormTemplateVersion"/> row and bumps
/// <see cref="FormTemplate.CurrentVersion"/>. Older versions stay in the
/// DB so historical FormInstances continue to render.
///
/// Items are a mix of group references (which point at a specific
/// FieldGroup LogicalId + Version) and standalone Field POCOs (inline
/// fields not part of any group). The renderer walks <c>ItemsJson</c> in
/// order and for each item either expands the referenced group (Phase 5
/// renderer work) or renders the inline field directly.
/// </summary>
[ApiController]
[Route("api/admin/form-templates")]
[Authorize(Policy = "ManageGlobals")]
public class FormTemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAuditService _audit;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public FormTemplatesController(AppDbContext db, IAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<List<FormTemplateListItemDto>>> List(
        [FromQuery] string? audience = null,
        [FromQuery] bool includeDeleted = false)
    {
        var q = _db.FormTemplates.Where(t => t.IsGlobal);
        if (!includeDeleted) q = q.Where(t => t.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(audience))
            q = q.Where(t => t.TargetAudience == audience);

        var rows = await q
            .OrderBy(t => t.TargetAudience).ThenBy(t => t.Name)
            .Select(t => new
            {
                t.LogicalId, t.Name, t.TargetAudience, t.IsGlobal,
                t.OwnerPracticeId, t.ParentLogicalId, t.CurrentVersion,
                t.UpdatedAt, t.DeletedAt,
                CurrentItemsJson = _db.FormTemplateVersions
                    .Where(v => v.FormTemplateLogicalId == t.LogicalId && v.Version == t.CurrentVersion)
                    .Select(v => v.ItemsJson)
                    .FirstOrDefault()
            })
            .ToListAsync();

        var dtos = rows.Select(r => new FormTemplateListItemDto(
            r.LogicalId, r.Name, r.TargetAudience, r.IsGlobal,
            r.OwnerPracticeId, r.ParentLogicalId, r.CurrentVersion,
            CountItems(r.CurrentItemsJson),
            r.UpdatedAt, r.DeletedAt != null
        )).ToList();
        return Ok(dtos);
    }

    [HttpGet("{logicalId:guid}")]
    public async Task<ActionResult<FormTemplateDetailDto>> Get(Guid logicalId)
    {
        var template = await _db.FormTemplates
            .FirstOrDefaultAsync(t => t.LogicalId == logicalId && t.IsGlobal);
        if (template is null) return NotFound();

        var current = await _db.FormTemplateVersions
            .FirstOrDefaultAsync(v =>
                v.FormTemplateLogicalId == logicalId && v.Version == template.CurrentVersion);

        var items = current is null
            ? new List<FormTemplateItemDto>()
            : await EnrichItemsForRead(DeserializeItems(current.ItemsJson));

        return Ok(new FormTemplateDetailDto(
            template.LogicalId, template.Name, template.TargetAudience, template.IsGlobal,
            template.OwnerPracticeId, template.ParentLogicalId, template.CurrentVersion,
            items, template.UpdatedAt, template.DeletedAt != null));
    }

    [HttpPost]
    public async Task<ActionResult<FormTemplateDetailDto>> Create(CreateFormTemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var validationError = await ValidateItems(req.Items);
        if (validationError != null) return BadRequest(validationError);

        var userId = TryGetUserId();

        var template = new FormTemplate
        {
            LogicalId = Guid.NewGuid(),
            Name = req.Name.Trim(),
            TargetAudience = (req.TargetAudience ?? "generic").Trim().ToLowerInvariant(),
            IsGlobal = true,
            ParentLogicalId = null,
            OwnerPracticeId = null,
            CurrentVersion = 1
        };
        var version = new FormTemplateVersion
        {
            FormTemplateLogicalId = template.LogicalId,
            Version = 1,
            Name = template.Name,
            ItemsJson = SerializeItems(req.Items ?? new()),
            CreatedByUserId = userId
        };

        _db.FormTemplates.Add(template);
        _db.FormTemplateVersions.Add(version);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Create,
            entityType: nameof(FormTemplate),
            entityId: template.LogicalId.ToString(),
            note: $"Created global template '{template.Name}' v1");

        return CreatedAtAction(nameof(Get), new { logicalId = template.LogicalId },
            await BuildDetail(template, version));
    }

    [HttpPut("{logicalId:guid}")]
    public async Task<ActionResult<FormTemplateDetailDto>> Update(
        Guid logicalId, UpdateFormTemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest("Name is required.");

        var template = await _db.FormTemplates
            .FirstOrDefaultAsync(t => t.LogicalId == logicalId && t.IsGlobal);
        if (template is null) return NotFound();
        if (template.DeletedAt != null) return BadRequest("Template is deleted.");

        var validationError = await ValidateItems(req.Items);
        if (validationError != null) return BadRequest(validationError);

        var userId = TryGetUserId();
        var nextVersion = template.CurrentVersion + 1;

        // Compute changed-field-names for the audit event.
        var prev = await _db.FormTemplateVersions.AsNoTracking()
            .FirstOrDefaultAsync(v =>
                v.FormTemplateLogicalId == logicalId && v.Version == template.CurrentVersion);
        var changes = new List<string>();
        if (template.Name != req.Name.Trim()) changes.Add(nameof(FormTemplate.Name));
        var newAudience = (req.TargetAudience ?? "generic").Trim().ToLowerInvariant();
        if (template.TargetAudience != newAudience) changes.Add(nameof(FormTemplate.TargetAudience));
        changes.Add("Items");  // always — items array is updated as a unit

        template.Name = req.Name.Trim();
        template.TargetAudience = newAudience;
        template.CurrentVersion = nextVersion;
        template.UpdatedAt = DateTime.UtcNow;

        var version = new FormTemplateVersion
        {
            FormTemplateLogicalId = logicalId,
            Version = nextVersion,
            Name = template.Name,
            ItemsJson = SerializeItems(req.Items ?? new()),
            CreatedByUserId = userId
        };
        _db.FormTemplateVersions.Add(version);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Update,
            entityType: nameof(FormTemplate),
            entityId: template.LogicalId.ToString(),
            changedFields: changes,
            note: $"Updated global template '{template.Name}' to v{nextVersion}");

        return Ok(await BuildDetail(template, version));
    }

    [HttpDelete("{logicalId:guid}")]
    public async Task<IActionResult> SoftDelete(Guid logicalId)
    {
        var template = await _db.FormTemplates
            .FirstOrDefaultAsync(t => t.LogicalId == logicalId && t.IsGlobal);
        if (template is null) return NotFound();
        if (template.DeletedAt != null) return NoContent();

        template.DeletedAt = DateTime.UtcNow;
        template.UpdatedAt = template.DeletedAt.Value;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            AuditAction.Delete,
            entityType: nameof(FormTemplate),
            entityId: template.LogicalId.ToString(),
            note: $"Soft-deleted global template '{template.Name}'");

        return NoContent();
    }

    // --- helpers ---

    private async Task<FormTemplateDetailDto> BuildDetail(FormTemplate t, FormTemplateVersion v)
    {
        var items = await EnrichItemsForRead(DeserializeItems(v.ItemsJson));
        return new FormTemplateDetailDto(
            t.LogicalId, t.Name, t.TargetAudience, t.IsGlobal,
            t.OwnerPracticeId, t.ParentLogicalId, t.CurrentVersion,
            items, t.UpdatedAt, t.DeletedAt != null);
    }

    /// <summary>
    /// Returns null when items are valid; otherwise a short error message.
    /// Validates that every group reference points at a real, non-deleted
    /// FieldGroup version, and that every standalone field has a label.
    /// </summary>
    private async Task<string?> ValidateItems(List<FormTemplateItemDto>? items)
    {
        if (items is null) return null;

        var groupIds = items.Where(i => i.Kind == "group" && i.GroupLogicalId.HasValue)
            .Select(i => i.GroupLogicalId!.Value).Distinct().ToList();

        var existing = await _db.FieldGroups
            .Where(g => groupIds.Contains(g.LogicalId) && g.DeletedAt == null)
            .Select(g => new { g.LogicalId, g.CurrentVersion })
            .ToDictionaryAsync(g => g.LogicalId, g => g.CurrentVersion);

        for (int i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (item.Kind == "group")
            {
                if (!item.GroupLogicalId.HasValue || !item.GroupVersion.HasValue)
                    return $"Item {i + 1}: group reference is missing logical id or version.";
                if (!existing.TryGetValue(item.GroupLogicalId.Value, out var maxVersion))
                    return $"Item {i + 1}: referenced field group does not exist or has been deleted.";
                if (item.GroupVersion.Value < 1 || item.GroupVersion.Value > maxVersion)
                    return $"Item {i + 1}: group version {item.GroupVersion.Value} is out of range (1..{maxVersion}).";
            }
            else if (item.Kind == "field")
            {
                if (item.Field is null) return $"Item {i + 1}: inline field is missing definition.";
                if (string.IsNullOrWhiteSpace(item.Field.Label))
                    return $"Item {i + 1}: inline field needs a label.";
            }
            else
            {
                return $"Item {i + 1}: unknown kind '{item.Kind}'.";
            }
        }
        return null;
    }

    /// <summary>
    /// Enrich each "group" item with the current group's name and field
    /// count for the UI. Inline fields pass through unchanged. Single
    /// batched lookup so we don't N+1.
    /// </summary>
    private async Task<List<FormTemplateItemDto>> EnrichItemsForRead(List<FormTemplateItemDto> items)
    {
        var groupIds = items.Where(i => i.Kind == "group" && i.GroupLogicalId.HasValue)
            .Select(i => i.GroupLogicalId!.Value).Distinct().ToList();
        if (groupIds.Count == 0) return items;

        var groups = await _db.FieldGroups
            .Where(g => groupIds.Contains(g.LogicalId))
            .Select(g => new { g.LogicalId, g.Name })
            .ToDictionaryAsync(g => g.LogicalId, g => g.Name);

        // For field counts we need the specific (LogicalId, Version) version
        // each item references — pull all needed versions in one query.
        var versionKeys = items
            .Where(i => i.Kind == "group" && i.GroupLogicalId.HasValue && i.GroupVersion.HasValue)
            .Select(i => new { LogicalId = i.GroupLogicalId!.Value, Version = i.GroupVersion!.Value })
            .Distinct().ToList();
        var ids = versionKeys.Select(k => k.LogicalId).Distinct().ToList();
        var versions = await _db.FieldGroupVersions
            .Where(v => ids.Contains(v.FieldGroupLogicalId))
            .Select(v => new { v.FieldGroupLogicalId, v.Version, v.FieldsJson })
            .ToListAsync();

        return items.Select(item =>
        {
            if (item.Kind != "group" || !item.GroupLogicalId.HasValue) return item;
            groups.TryGetValue(item.GroupLogicalId.Value, out var name);
            var v = versions.FirstOrDefault(x =>
                x.FieldGroupLogicalId == item.GroupLogicalId && x.Version == item.GroupVersion);
            int? count = v is null ? null : CountFields(v.FieldsJson);
            return item with { GroupName = name, GroupFieldCount = count };
        }).ToList();
    }

    private static int CountItems(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return 0;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.GetArrayLength() : 0;
        }
        catch { return 0; }
    }

    private static int CountFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return 0;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.GetArrayLength() : 0;
        }
        catch { return 0; }
    }

    private static string SerializeItems(List<FormTemplateItemDto> items)
    {
        // Materialize into the model POCO so the persisted JSON exactly
        // matches the C# Field/FormTemplateItem shapes (avoids drift).
        var list = items.Select(i => new FormTemplateItem
        {
            Kind = i.Kind,
            GroupLogicalId = i.GroupLogicalId,
            GroupVersion = i.GroupVersion,
            Field = i.Field is null ? null : new Field
            {
                Id = string.IsNullOrWhiteSpace(i.Field.Id)
                    ? Guid.NewGuid().ToString("N")[..8]
                    : i.Field.Id,
                Type = i.Field.Type,
                Label = i.Field.Label ?? string.Empty,
                Placeholder = i.Field.Placeholder,
                HelpText = i.Field.HelpText,
                Required = i.Field.Required,
                Width = i.Field.Width,
                MaxLength = i.Field.MaxLength,
                MinLength = i.Field.MinLength,
                Pattern = i.Field.Pattern,
                Options = i.Field.Options?
                    .Select(o => new FieldOption { Value = o.Value, Label = o.Label }).ToList(),
                PhiFlag = i.Field.PhiFlag,
                ConditionalLogic = i.Field.ConditionalLogic is null ? null : new FieldConditionalLogic
                {
                    SourceFieldId = i.Field.ConditionalLogic.SourceFieldId,
                    Operator = i.Field.ConditionalLogic.Operator,
                    Value = i.Field.ConditionalLogic.Value
                }
            }
        }).ToList();
        return JsonSerializer.Serialize(list, JsonOpts);
    }

    private static List<FormTemplateItemDto> DeserializeItems(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        var list = JsonSerializer.Deserialize<List<FormTemplateItem>>(json, JsonOpts) ?? new();
        return list.Select(i => new FormTemplateItemDto(
            i.Kind,
            i.GroupLogicalId,
            i.GroupVersion,
            GroupName: null,        // filled by EnrichItemsForRead
            GroupFieldCount: null,
            Field: i.Field is null ? null : new FieldDto(
                i.Field.Id, i.Field.Type, i.Field.Label, i.Field.Placeholder,
                i.Field.HelpText, i.Field.Required, i.Field.Width,
                i.Field.MaxLength, i.Field.MinLength, i.Field.Pattern,
                i.Field.Options?.Select(o => new FieldOptionDto(o.Value, o.Label)).ToList(),
                i.Field.PhiFlag,
                i.Field.ConditionalLogic is null ? null
                    : new FieldConditionalLogicDto(
                        i.Field.ConditionalLogic.SourceFieldId,
                        i.Field.ConditionalLogic.Operator,
                        i.Field.ConditionalLogic.Value))
        )).ToList();
    }

    private int? TryGetUserId()
    {
        var raw = User.FindFirstValue("userId") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : null;
    }
}
