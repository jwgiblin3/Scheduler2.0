using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public SettingsController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);

    // The JWT bearer handler remaps the short "role" claim to the long-form
    // ClaimTypes.Role ("http://schemas.microsoft.com/ws/2008/06/identity/claims/role")
    // via JwtSecurityTokenHandler.DefaultInboundClaimTypeMap, so reading "role"
    // alone returns null. Prefer the mapped claim; keep "role" as a fallback in
    // case the map is ever disabled.
    private string UserRole =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? User.FindFirstValue("role")
        ?? "";

    [HttpGet("practice")]
    public async Task<ActionResult> GetPracticeSettings()
    {
        var practice = await _db.Practices
            .Include(p => p.NotificationSettings)
            .FirstOrDefaultAsync(p => p.Id == PracticeId);

        if (practice is null) return NotFound();

        return Ok(new
        {
            practice.Id,
            practice.Name,
            practice.Slug,
            practice.Phone,
            practice.Address,         // legacy — kept so older clients keep working
            practice.AddressLine1,
            practice.City,
            practice.State,
            practice.PostalCode,
            practice.Website,
            practice.LogoUrl,
            practice.BannerColor,
            practice.TimeZone,
            practice.CancellationWindowHours,
            NotificationSettings = practice.NotificationSettings is null ? null : new
            {
                practice.NotificationSettings.Reminder1Hours,
                practice.NotificationSettings.Reminder2Hours,
                practice.NotificationSettings.EmailEnabled,
                practice.NotificationSettings.SmsEnabled,
                practice.NotificationSettings.FromEmail,
                practice.NotificationSettings.FromName
            }
        });
    }

    [HttpPut("practice")]
    public async Task<ActionResult> UpdatePracticeSettings([FromBody] UpdatePracticeRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var practice = await _db.Practices
            .Include(p => p.NotificationSettings)
            .FirstOrDefaultAsync(p => p.Id == PracticeId);

        if (practice is null) return NotFound();

        // Slug updates (optional). Normalize + validate uniqueness.
        if (!string.IsNullOrWhiteSpace(req.Slug))
        {
            var normalized = NormalizeSlug(req.Slug);
            if (string.IsNullOrWhiteSpace(normalized))
                return BadRequest("Slug must contain at least one letter or number.");

            if (normalized != practice.Slug)
            {
                var taken = await _db.Practices.AnyAsync(p => p.Slug == normalized && p.Id != practice.Id);
                if (taken) return BadRequest("That practice URL slug is already taken.");
                practice.Slug = normalized;
            }
        }

        practice.Name = req.Name;
        practice.Phone = req.Phone;
        practice.Address = req.Address;
        practice.AddressLine1 = Trim(req.AddressLine1);
        practice.City = Trim(req.City);
        practice.State = Trim(req.State);
        practice.PostalCode = Trim(req.PostalCode);
        practice.Website = NormalizeWebsite(req.Website);
        practice.LogoUrl = NormalizeLogoUrl(req.LogoUrl);
        practice.BannerColor = NormalizeBannerColor(req.BannerColor);
        practice.TimeZone = req.TimeZone;
        practice.CancellationWindowHours = req.CancellationWindowHours;

        await _db.SaveChangesAsync();

        // CORS allow-list may have changed — the dynamic origin policy caches
        // practice websites, so nudge it to reload on the next request.
        PracticeCorsOriginProvider.Invalidate();

        return Ok(new { practice.Slug });
    }

    private static string? NormalizeWebsite(string? input) =>
        WebsiteNormalizer.Normalize(input);

    // Trim + empty-to-null so blank strings don't pollute the database.
    private static string? Trim(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var t = input.Trim();
        return t.Length == 0 ? null : t;
    }

    // Logo URLs are stored as-is but trimmed + emptied out so a blank string
    // doesn't render as a broken image on the booking page.
    private static string? NormalizeLogoUrl(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var trimmed = input.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    // Banner colors must be a 3- or 6-digit hex code. Anything else is rejected
    // at the UI layer today, but we guard here too so bad data never reaches
    // the DB. Leading '#' is added if missing.
    private static string? NormalizeBannerColor(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var value = input.Trim();
        if (!value.StartsWith('#')) value = "#" + value;
        var hex = value[1..];
        if (hex.Length != 3 && hex.Length != 6) return null;
        foreach (var ch in hex)
        {
            var isHexDigit = (ch >= '0' && ch <= '9')
                          || (ch >= 'a' && ch <= 'f')
                          || (ch >= 'A' && ch <= 'F');
            if (!isHexDigit) return null;
        }
        return "#" + hex.ToLowerInvariant();
    }

    private static string NormalizeSlug(string input)
    {
        // lowercase, trim, replace whitespace/underscores with dashes, drop anything not [a-z0-9-]
        var lower = input.Trim().ToLowerInvariant();
        var builder = new System.Text.StringBuilder(lower.Length);
        char? prev = null;
        foreach (var ch in lower)
        {
            if (char.IsLetterOrDigit(ch)) { builder.Append(ch); prev = ch; }
            else if (ch == ' ' || ch == '_' || ch == '-')
            {
                if (prev != '-') { builder.Append('-'); prev = '-'; }
            }
        }
        return builder.ToString().Trim('-');
    }

    // -------- Holidays --------
    //
    // Practice-level closures — blackout dates that apply to every provider.
    // Used by AvailabilityService to suppress slot generation on those days.

    [HttpGet("holidays")]
    public async Task<ActionResult> GetHolidays()
    {
        var rows = await _db.PracticeHolidays
            .Where(h => h.PracticeId == PracticeId)
            .OrderBy(h => h.StartDate)
            .Select(h => new
            {
                h.Id,
                StartDate = h.StartDate.ToString("yyyy-MM-dd"),
                EndDate = h.EndDate.ToString("yyyy-MM-dd"),
                h.Name
            })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("holidays")]
    public async Task<ActionResult> CreateHoliday([FromBody] HolidayRequest req)
    {
        if (UserRole != "Admin") return Forbid();
        if (!TryParseDateRange(req.StartDate, req.EndDate, out var start, out var end, out var err))
            return BadRequest(err);

        var holiday = new PracticeHoliday
        {
            PracticeId = PracticeId,
            StartDate = start,
            EndDate = end,
            Name = Trim(req.Name)
        };
        _db.PracticeHolidays.Add(holiday);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            holiday.Id,
            StartDate = holiday.StartDate.ToString("yyyy-MM-dd"),
            EndDate = holiday.EndDate.ToString("yyyy-MM-dd"),
            holiday.Name
        });
    }

    [HttpPut("holidays/{id:int}")]
    public async Task<ActionResult> UpdateHoliday(int id, [FromBody] HolidayRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var holiday = await _db.PracticeHolidays
            .FirstOrDefaultAsync(h => h.Id == id && h.PracticeId == PracticeId);
        if (holiday is null) return NotFound();

        if (!TryParseDateRange(req.StartDate, req.EndDate, out var start, out var end, out var err))
            return BadRequest(err);

        holiday.StartDate = start;
        holiday.EndDate = end;
        holiday.Name = Trim(req.Name);

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("holidays/{id:int}")]
    public async Task<ActionResult> DeleteHoliday(int id)
    {
        if (UserRole != "Admin") return Forbid();

        var holiday = await _db.PracticeHolidays
            .FirstOrDefaultAsync(h => h.Id == id && h.PracticeId == PracticeId);
        if (holiday is null) return NotFound();

        _db.PracticeHolidays.Remove(holiday);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Shared parser — both holidays and provider exceptions receive dates as
    // "yyyy-MM-dd" strings (the ISO format the Angular date input emits) and
    // must always satisfy StartDate <= EndDate.
    private static bool TryParseDateRange(string? startIn, string? endIn,
        out DateOnly start, out DateOnly end, out string error)
    {
        start = default;
        end = default;
        error = "";
        if (!DateOnly.TryParse(startIn, out start)) { error = "Invalid start date."; return false; }
        if (!DateOnly.TryParse(endIn, out end)) { error = "Invalid end date."; return false; }
        if (end < start) { error = "End date must be on or after start date."; return false; }
        return true;
    }

    [HttpPut("notifications")]
    public async Task<ActionResult> UpdateNotificationSettings([FromBody] UpdateNotificationSettingsRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var practice = await _db.Practices
            .Include(p => p.NotificationSettings)
            .FirstOrDefaultAsync(p => p.Id == PracticeId);

        if (practice is null) return NotFound();

        if (practice.NotificationSettings is null)
        {
            practice.NotificationSettings = new NotificationSettings { PracticeId = PracticeId };
            _db.NotificationSettings.Add(practice.NotificationSettings);
        }

        practice.NotificationSettings.Reminder1Hours = req.Reminder1Hours;
        practice.NotificationSettings.Reminder2Hours = req.Reminder2Hours;
        practice.NotificationSettings.EmailEnabled = req.EmailEnabled;
        practice.NotificationSettings.SmsEnabled = req.SmsEnabled;
        practice.NotificationSettings.FromEmail = req.FromEmail;
        practice.NotificationSettings.FromName = req.FromName;

        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record UpdatePracticeRequest(
    string Name,
    string? Phone,
    string? Address,        // legacy single-line — still accepted so old clients keep working
    string? AddressLine1,
    string? City,
    string? State,
    string? PostalCode,
    string? Website,
    string? LogoUrl,
    string? BannerColor,
    string? TimeZone,
    int CancellationWindowHours,
    string? Slug
);

public record UpdateNotificationSettingsRequest(
    int Reminder1Hours,
    int Reminder2Hours,
    bool EmailEnabled,
    bool SmsEnabled,
    string FromEmail,
    string FromName
);

public record HolidayRequest(
    string? StartDate,   // "yyyy-MM-dd"
    string? EndDate,     // "yyyy-MM-dd"
    string? Name
);
