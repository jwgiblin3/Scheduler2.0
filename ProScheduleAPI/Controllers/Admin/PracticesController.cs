using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;

namespace ProScheduleAPI.Controllers.Admin;

/// <summary>
/// Cross-tenant practice browser for SuperAdmin. Read-only. Each row carries
/// computed counts (users, providers, clients, appointments, forms,
/// overrides) so the UI can show useful at-a-glance metrics.
///
/// We deliberately do NOT expose practice-edit endpoints here — those
/// already live on the per-practice controllers and are scoped by the
/// PracticeId claim in the JWT. Letting SuperAdmins arbitrarily mutate
/// other practices' data would bypass the tenant scoping; if/when we need
/// it we'll add it explicitly with audit logging.
/// </summary>
[ApiController]
[Route("api/admin/practices")]
[Authorize(Policy = "SuperAdmin")]
public class PracticesController : ControllerBase
{
    private readonly AppDbContext _db;

    public PracticesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<List<PracticeAdminSummaryDto>>> List()
    {
        // Single round trip with subqueries for the counts. The DB is the
        // right place for these — pulling rows + counting in C# would
        // ship megabytes of data on a busy platform.
        var rows = await _db.Practices
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id, p.Name, p.Slug, p.AdminEmail, p.Phone, p.Website,
                p.AddressLine1, p.City, p.State, p.PostalCode,
                p.CreatedAt,
                UserCount        = _db.Users.Count(u => u.PracticeId == p.Id),
                ProviderCount    = _db.Providers.Count(pr => pr.PracticeId == p.Id),
                ClientCount      = _db.Clients.Count(c => c.PracticeId == p.Id),
                AppointmentCount = _db.Appointments.Count(a => a.PracticeId == p.Id),
                LegacyFormCount  = _db.PracticeForms.Count(f => f.PracticeId == p.Id),
                OverrideGroupCount    = _db.FieldGroups.Count(g =>
                    g.OwnerPracticeId == p.Id && g.ParentLogicalId != null),
                OverrideTemplateCount = _db.FormTemplates.Count(t =>
                    t.OwnerPracticeId == p.Id && t.ParentLogicalId != null)
            })
            .ToListAsync();

        var dtos = rows.Select(r => new PracticeAdminSummaryDto(
            r.Id, r.Name, r.Slug, r.AdminEmail, r.Phone, r.Website,
            BuildAddressSummary(r.AddressLine1, r.City, r.State, r.PostalCode),
            r.CreatedAt,
            r.UserCount, r.ProviderCount, r.ClientCount, r.AppointmentCount,
            r.LegacyFormCount, r.OverrideGroupCount, r.OverrideTemplateCount
        )).ToList();
        return Ok(dtos);
    }

    /// <summary>
    /// Compose a one-line address when any of the structured address parts
    /// are filled in. Returns null when the practice hasn't entered any
    /// address fields, so the UI can hide the row entirely instead of
    /// rendering "null, null".
    /// </summary>
    private static string? BuildAddressSummary(
        string? line1, string? city, string? state, string? postal)
    {
        var line1Trim = (line1 ?? "").Trim();
        var cityTrim = (city ?? "").Trim();
        var stateTrim = (state ?? "").Trim();
        var postalTrim = (postal ?? "").Trim();
        var hasAny = line1Trim.Length > 0 || cityTrim.Length > 0
            || stateTrim.Length > 0 || postalTrim.Length > 0;
        if (!hasAny) return null;

        var stateZip = string.Join(" ", new[] { stateTrim, postalTrim }
            .Where(s => s.Length > 0));
        var cityStateZip = string.Join(", ", new[] { cityTrim, stateZip }
            .Where(s => s.Length > 0));
        return string.Join(" · ", new[] { line1Trim, cityStateZip }
            .Where(s => s.Length > 0));
    }
}
