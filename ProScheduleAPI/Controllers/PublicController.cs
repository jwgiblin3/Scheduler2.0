using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/public")]
public class PublicController : ControllerBase
{
    private readonly AppDbContext _db;
    public PublicController(AppDbContext db) => _db = db;

    // Returns practice info + active providers + active appointment types for the booking page
    [HttpGet("{slug}")]
    public async Task<ActionResult> GetPracticeBookingInfo(string slug)
    {
        var practice = await _db.Practices
            .FirstOrDefaultAsync(p => p.Slug == slug);

        if (practice is null) return NotFound();

        var providers = await _db.Providers
            .Where(p => p.PracticeId == practice.Id && p.IsActive)
            .Include(p => p.Availabilities)
            .Include(p => p.ProviderAppointmentTypes)
            .ToListAsync();

        var apptTypes = await _db.AppointmentTypes
            .Where(a => a.PracticeId == practice.Id && a.IsActive)
            .ToListAsync();

        return Ok(new
        {
            practice.Id,
            practice.Name,
            practice.Slug,
            practice.TimeZone,
            Providers = providers.Select(p => new
            {
                p.Id,
                DisplayName = ResolveDisplayName(p),
                p.Bio,
                AppointmentTypeIds = p.ProviderAppointmentTypes.Select(x => x.AppointmentTypeId).ToList()
            }),
            AppointmentTypes = apptTypes.Select(a => new AppointmentTypeDto(
                a.Id, a.Name, a.Description, a.DurationMinutes,
                a.BufferBeforeMinutes, a.BufferAfterMinutes,
                a.RequiresIntakeForm, a.IsActive))
        });
    }

    // Per-provider booking page — pre-selects the provider
    [HttpGet("{slug}/provider/{providerId}")]
    public async Task<ActionResult> GetProviderBookingInfo(string slug, int providerId)
    {
        var practice = await _db.Practices.FirstOrDefaultAsync(p => p.Slug == slug);
        if (practice is null) return NotFound();

        var provider = await _db.Providers
            .Where(p => p.PracticeId == practice.Id && p.Id == providerId && p.IsActive)
            .Include(p => p.Availabilities)
            .Include(p => p.ProviderAppointmentTypes)
            .FirstOrDefaultAsync();

        if (provider is null) return NotFound();

        var apptTypeIds = provider.ProviderAppointmentTypes.Select(x => x.AppointmentTypeId).ToList();
        var apptTypes = await _db.AppointmentTypes
            .Where(a => apptTypeIds.Contains(a.Id) && a.IsActive)
            .ToListAsync();

        return Ok(new
        {
            practice.Id,
            practice.Name,
            practice.Slug,
            practice.TimeZone,
            Provider = new
            {
                provider.Id,
                DisplayName = ResolveDisplayName(provider),
                provider.Bio,
                AppointmentTypeIds = apptTypeIds
            },
            AppointmentTypes = apptTypes.Select(a => new AppointmentTypeDto(
                a.Id, a.Name, a.Description, a.DurationMinutes,
                a.BufferBeforeMinutes, a.BufferAfterMinutes,
                a.RequiresIntakeForm, a.IsActive))
        });
    }

    // Prefer the new DisplayName; fall back to legacy First + Last for older rows.
    private static string ResolveDisplayName(Provider p)
    {
        if (!string.IsNullOrWhiteSpace(p.DisplayName)) return p.DisplayName!;
        var legacy = $"{p.FirstName} {p.LastName}".Trim();
        return string.IsNullOrEmpty(legacy) ? "Provider" : legacy;
    }
}
