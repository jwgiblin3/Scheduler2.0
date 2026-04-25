using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

/// <summary>
/// Endpoints for the "alert me if an earlier slot opens up" booking waitlist.
/// Creation is public (the booking page is unauthenticated up until the final
/// book step); listing is admin-only so staff can see who's waiting.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AvailabilityAlertsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AvailabilityAlertsController(AppDbContext db) => _db = db;

    private int? PracticeIdFromClaim =>
        int.TryParse(User.FindFirstValue("practiceId"), out var id) ? id : null;

    private string UserRole =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? User.FindFirstValue("role")
        ?? "";

    /// <summary>
    /// Anonymous — called by the public booking page. Practice is resolved from
    /// the slug so we don't need a JWT on this request.
    /// </summary>
    [HttpPost("public/{slug}")]
    [AllowAnonymous]
    public async Task<ActionResult<CreatedAlertDto>> CreatePublic(string slug, CreateAlertRequest req)
    {
        var practice = await _db.Practices
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Slug == slug);
        if (practice is null) return NotFound("Practice not found.");

        var email = (req.Email ?? "").Trim();
        var name = (req.ClientName ?? "").Trim();
        if (string.IsNullOrEmpty(email) || !email.Contains('@'))
            return BadRequest("A valid email is required.");
        if (string.IsNullOrEmpty(name))
            return BadRequest("Name is required.");

        // Verify the selected type + optional provider belong to this practice.
        // Prevents a caller from cross-seeding alerts into another practice.
        var typeOk = await _db.AppointmentTypes.AnyAsync(a =>
            a.Id == req.AppointmentTypeId && a.PracticeId == practice.Id);
        if (!typeOk) return BadRequest("Unknown appointment type.");

        if (req.ProviderId is int pid)
        {
            var providerOk = await _db.Providers.AnyAsync(p =>
                p.Id == pid && p.PracticeId == practice.Id);
            if (!providerOk) return BadRequest("Unknown provider.");
        }

        var alert = new AvailabilityAlert
        {
            PracticeId = practice.Id,
            AppointmentTypeId = req.AppointmentTypeId,
            ProviderId = req.ProviderId,
            ClientName = name,
            Email = email,
            Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim(),
            PreferencesJson = string.IsNullOrWhiteSpace(req.PreferencesJson)
                ? "{}"
                : req.PreferencesJson,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.AvailabilityAlerts.Add(alert);
        await _db.SaveChangesAsync();

        return Ok(new CreatedAlertDto(alert.Id, alert.CreatedAt));
    }

    /// <summary>Admin list of active alerts — shown on a practice "Waitlist" screen.</summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<AlertDto>>> GetMine([FromQuery] bool includeFulfilled = false)
    {
        if (PracticeIdFromClaim is not int practiceId) return Forbid();

        var query = _db.AvailabilityAlerts
            .AsNoTracking()
            .Where(a => a.PracticeId == practiceId);
        if (!includeFulfilled) query = query.Where(a => a.IsActive);

        var rows = await query
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AlertDto(
                a.Id, a.AppointmentTypeId, a.ProviderId,
                a.ClientName, a.Email, a.Phone,
                a.PreferencesJson, a.IsActive, a.CreatedAt, a.FulfilledAt))
            .ToListAsync();

        return Ok(rows);
    }

    /// <summary>Mark an alert as fulfilled (admin manually clearing it).</summary>
    [HttpPost("{id:int}/fulfill")]
    [Authorize]
    public async Task<IActionResult> Fulfill(int id)
    {
        if (PracticeIdFromClaim is not int practiceId) return Forbid();
        if (UserRole != "Admin") return Forbid();

        var alert = await _db.AvailabilityAlerts
            .FirstOrDefaultAsync(a => a.Id == id && a.PracticeId == practiceId);
        if (alert is null) return NotFound();

        alert.IsActive = false;
        alert.FulfilledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record CreateAlertRequest(
    int AppointmentTypeId,
    int? ProviderId,
    string ClientName,
    string Email,
    string? Phone,
    string PreferencesJson
);

public record CreatedAlertDto(int Id, DateTime CreatedAt);

public record AlertDto(
    int Id,
    int AppointmentTypeId,
    int? ProviderId,
    string ClientName,
    string Email,
    string? Phone,
    string PreferencesJson,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? FulfilledAt
);
