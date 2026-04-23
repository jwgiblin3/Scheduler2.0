using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProvidersController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProvidersController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);

    [HttpGet]
    public async Task<ActionResult<List<ProviderDto>>> GetAll()
    {
        var providers = await _db.Providers
            .Where(p => p.PracticeId == PracticeId)
            .Include(p => p.Availabilities)
            .Include(p => p.ProviderAppointmentTypes)
            .ToListAsync();

        return Ok(providers.Select(ToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ProviderDto>> GetById(int id)
    {
        var provider = await _db.Providers
            .Where(p => p.PracticeId == PracticeId && p.Id == id)
            .Include(p => p.Availabilities)
            .Include(p => p.ProviderAppointmentTypes)
            .FirstOrDefaultAsync();

        if (provider is null) return NotFound();
        return Ok(ToDto(provider));
    }

    [HttpPost]
    public async Task<ActionResult<ProviderDto>> Create(CreateProviderRequest req)
    {
        var provider = new Provider
        {
            PracticeId = PracticeId,
            DisplayName = req.DisplayName,
            FirstName = string.Empty,
            LastName = string.Empty,
            Email = req.Email,
            Phone = req.Phone,
            Description = req.Description,
            Availabilities = req.Availabilities.Select(a => new ProviderAvailability
            {
                DayOfWeek = a.DayOfWeek,
                StartTime = a.StartTime,
                EndTime = a.EndTime,
                IsActive = a.IsActive
            }).ToList(),
            ProviderAppointmentTypes = req.AppointmentTypeIds.Select(id => new ProviderAppointmentType
            {
                AppointmentTypeId = id
            }).ToList()
        };

        _db.Providers.Add(provider);
        await _db.SaveChangesAsync();

        await _db.Entry(provider).Collection(p => p.Availabilities).LoadAsync();
        await _db.Entry(provider).Collection(p => p.ProviderAppointmentTypes).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = provider.Id }, ToDto(provider));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ProviderDto>> Update(int id, UpdateProviderRequest req)
    {
        var provider = await _db.Providers
            .Where(p => p.PracticeId == PracticeId && p.Id == id)
            .Include(p => p.Availabilities)
            .Include(p => p.ProviderAppointmentTypes)
            .FirstOrDefaultAsync();

        if (provider is null) return NotFound();

        provider.DisplayName = req.DisplayName;
        provider.Email = req.Email;
        provider.Phone = req.Phone;
        provider.Description = req.Description;
        provider.IsActive = req.IsActive;

        _db.ProviderAvailabilities.RemoveRange(provider.Availabilities);
        provider.Availabilities = req.Availabilities.Select(a => new ProviderAvailability
        {
            ProviderId = id,
            DayOfWeek = a.DayOfWeek,
            StartTime = a.StartTime,
            EndTime = a.EndTime,
            IsActive = a.IsActive
        }).ToList();

        _db.ProviderAppointmentTypes.RemoveRange(provider.ProviderAppointmentTypes);
        provider.ProviderAppointmentTypes = req.AppointmentTypeIds.Select(atId => new ProviderAppointmentType
        {
            ProviderId = id,
            AppointmentTypeId = atId
        }).ToList();

        await _db.SaveChangesAsync();
        return Ok(ToDto(provider));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var provider = await _db.Providers
            .FirstOrDefaultAsync(p => p.PracticeId == PracticeId && p.Id == id);

        if (provider is null) return NotFound();

        provider.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // -------- Provider exceptions --------
    //
    // Per-provider out-of-office windows. Separate from practice-wide holidays.
    // AvailabilityService layers both sets on top of the recurring weekly hours.

    [HttpGet("{id:int}/exceptions")]
    public async Task<ActionResult> GetExceptions(int id)
    {
        // Only allow reading exceptions for a provider in the caller's practice.
        var exists = await _db.Providers
            .AnyAsync(p => p.Id == id && p.PracticeId == PracticeId);
        if (!exists) return NotFound();

        var rows = await _db.ProviderExceptions
            .Where(e => e.ProviderId == id)
            .OrderBy(e => e.StartDate)
            .Select(e => new
            {
                e.Id,
                StartDate = e.StartDate.ToString("yyyy-MM-dd"),
                EndDate = e.EndDate.ToString("yyyy-MM-dd"),
                e.Reason
            })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("{id:int}/exceptions")]
    public async Task<ActionResult> CreateException(int id, [FromBody] ProviderExceptionRequest req)
    {
        var exists = await _db.Providers
            .AnyAsync(p => p.Id == id && p.PracticeId == PracticeId);
        if (!exists) return NotFound();

        if (!DateOnly.TryParse(req.StartDate, out var start)) return BadRequest("Invalid start date.");
        if (!DateOnly.TryParse(req.EndDate, out var end)) return BadRequest("Invalid end date.");
        if (end < start) return BadRequest("End date must be on or after start date.");

        var exception = new ProviderException
        {
            ProviderId = id,
            StartDate = start,
            EndDate = end,
            Reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim()
        };
        _db.ProviderExceptions.Add(exception);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            exception.Id,
            StartDate = exception.StartDate.ToString("yyyy-MM-dd"),
            EndDate = exception.EndDate.ToString("yyyy-MM-dd"),
            exception.Reason
        });
    }

    [HttpPut("{id:int}/exceptions/{exceptionId:int}")]
    public async Task<ActionResult> UpdateException(int id, int exceptionId, [FromBody] ProviderExceptionRequest req)
    {
        var exception = await _db.ProviderExceptions
            .Include(e => e.Provider)
            .FirstOrDefaultAsync(e => e.Id == exceptionId && e.ProviderId == id
                                      && e.Provider.PracticeId == PracticeId);
        if (exception is null) return NotFound();

        if (!DateOnly.TryParse(req.StartDate, out var start)) return BadRequest("Invalid start date.");
        if (!DateOnly.TryParse(req.EndDate, out var end)) return BadRequest("Invalid end date.");
        if (end < start) return BadRequest("End date must be on or after start date.");

        exception.StartDate = start;
        exception.EndDate = end;
        exception.Reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim();

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}/exceptions/{exceptionId:int}")]
    public async Task<ActionResult> DeleteException(int id, int exceptionId)
    {
        var exception = await _db.ProviderExceptions
            .Include(e => e.Provider)
            .FirstOrDefaultAsync(e => e.Id == exceptionId && e.ProviderId == id
                                      && e.Provider.PracticeId == PracticeId);
        if (exception is null) return NotFound();

        _db.ProviderExceptions.Remove(exception);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProviderDto ToDto(Provider p) => new(
        p.Id,
        ResolveDisplayName(p),
        p.Email,
        p.Phone,
        p.Description,
        p.IsActive,
        p.Availabilities.Select(a => new AvailabilityDto(a.Id, a.DayOfWeek, a.StartTime, a.EndTime, a.IsActive)).ToList(),
        p.ProviderAppointmentTypes.Select(x => x.AppointmentTypeId).ToList()
    );

    // Use DisplayName if set; fall back to legacy First + Last for pre-existing rows.
    private static string ResolveDisplayName(Provider p)
    {
        if (!string.IsNullOrWhiteSpace(p.DisplayName)) return p.DisplayName!;
        var legacy = $"{p.FirstName} {p.LastName}".Trim();
        return string.IsNullOrEmpty(legacy) ? "Unnamed Provider" : legacy;
    }
}

public record ProviderExceptionRequest(
    string? StartDate,   // "yyyy-MM-dd"
    string? EndDate,     // "yyyy-MM-dd"
    string? Reason
);
