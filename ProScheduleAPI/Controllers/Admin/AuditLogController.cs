using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers.Admin;

/// <summary>
/// SuperAdmin-only audit-log browser. Read-only by design — there's no
/// endpoint here that mutates audit rows, and the application's SQL
/// principal should not have UPDATE or DELETE on <c>dbo.AuditLogs</c>
/// either (parking lot #15 covers the operational grant).
///
/// Filtering: all parameters are AND-combined. Date range is inclusive on
/// both ends. Pagination is offset-based (page + pageSize) — fine for the
/// audit volumes we expect; if/when the table gets very large we can move
/// to keyset pagination on (Timestamp, Id).
/// </summary>
[ApiController]
[Route("api/admin/audit")]
[Authorize(Policy = "SuperAdmin")]
public class AuditLogController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private const int DefaultPageSize = 50;
    private const int MaxPageSize = 500;

    public AuditLogController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<AuditLogPageDto>> List(
        [FromQuery] AuditAction? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] int? userId = null,
        [FromQuery] int? practiceId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = DefaultPageSize;
        if (pageSize > MaxPageSize) pageSize = MaxPageSize;

        var q = _db.AuditLogs.AsNoTracking().AsQueryable();

        if (action.HasValue)                         q = q.Where(a => a.Action == action.Value);
        if (!string.IsNullOrWhiteSpace(entityType))  q = q.Where(a => a.EntityType == entityType);
        if (userId.HasValue)                         q = q.Where(a => a.UserId == userId.Value);
        if (practiceId.HasValue)                     q = q.Where(a => a.PracticeId == practiceId.Value);
        if (from.HasValue)                           q = q.Where(a => a.Timestamp >= from.Value);
        if (to.HasValue)                             q = q.Where(a => a.Timestamp <= to.Value);

        var total = await q.LongCountAsync();

        // Project with joins to surface user email/name and practice name.
        // LEFT joins so audit rows with no user (failed logins where the
        // email didn't match any account) still come through.
        var rows = await q
            .OrderByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id, a.Timestamp,
                a.UserId,
                UserEmail = a.User != null ? a.User.Email : null,
                UserFirstName = a.User != null ? a.User.FirstName : null,
                UserLastName  = a.User != null ? a.User.LastName  : null,
                a.Role, a.IpAddress, a.Action, a.EntityType, a.EntityId,
                a.PracticeId,
                PracticeName = a.PracticeId != null
                    ? _db.Practices.Where(p => p.Id == a.PracticeId).Select(p => p.Name).FirstOrDefault()
                    : null,
                a.ChangedFieldsJson, a.Note
            })
            .ToListAsync();

        var dtos = rows.Select(r => new AuditLogRowDto(
            r.Id, r.Timestamp, r.UserId, r.UserEmail,
            BuildUserName(r.UserFirstName, r.UserLastName),
            r.Role, r.IpAddress, r.Action, r.EntityType, r.EntityId,
            r.PracticeId, r.PracticeName,
            DeserializeChangedFields(r.ChangedFieldsJson),
            r.Note
        )).ToList();

        return Ok(new AuditLogPageDto(total, page, pageSize, dtos));
    }

    private static string? BuildUserName(string? first, string? last)
    {
        if (string.IsNullOrWhiteSpace(first) && string.IsNullOrWhiteSpace(last)) return null;
        return $"{first ?? ""} {last ?? ""}".Trim();
    }

    private static List<string>? DeserializeChangedFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOpts);
        }
        catch
        {
            // If the payload is somehow malformed, surface a single sentinel
            // entry rather than 500ing the whole page.
            return new List<string> { "(unparseable)" };
        }
    }
}
