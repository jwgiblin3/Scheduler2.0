using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public SettingsController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);
    private string UserRole => User.FindFirstValue("role") ?? "";

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
            practice.Address,
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

        practice.Name = req.Name;
        practice.Phone = req.Phone;
        practice.Address = req.Address;
        practice.TimeZone = req.TimeZone;
        practice.CancellationWindowHours = req.CancellationWindowHours;

        await _db.SaveChangesAsync();
        return NoContent();
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
    string? Address,
    string? TimeZone,
    int CancellationWindowHours
);

public record UpdateNotificationSettingsRequest(
    int Reminder1Hours,
    int Reminder2Hours,
    bool EmailEnabled,
    bool SmsEnabled,
    string FromEmail,
    string FromName
);
