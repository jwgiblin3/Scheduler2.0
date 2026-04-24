using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers;

/// <summary>
/// Client-facing submission endpoint for filled-in forms. Admin CRUD for form
/// definitions lives in FormsController — this controller exists only for the
/// public /submit endpoint (and the legacy /public endpoint kept as a
/// compatibility shim for older booking confirmation pages).
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class IntakeFormsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    public IntakeFormsController(AppDbContext db, EmailService email) { _db = db; _email = email; }

    /// <summary>
    /// Legacy compat: return the *first* form attached to an appointment type,
    /// shaped like the old single-intake-form response. New clients should call
    /// GET /api/forms/public/appointment-type/{id} to get the full list.
    /// </summary>
    [HttpGet("public/{appointmentTypeId:int}")]
    public async Task<ActionResult<PracticeFormDto>> GetPublicLegacy(int appointmentTypeId)
    {
        var first = await _db.AppointmentTypeForms
            .Where(x => x.AppointmentTypeId == appointmentTypeId)
            .OrderBy(x => x.SortOrder)
            .Select(x => new PracticeFormDto(
                x.PracticeForm.Id,
                x.PracticeForm.Name,
                x.PracticeForm.FieldsJson,
                x.PracticeForm.UpdatedAt))
            .FirstOrDefaultAsync();

        if (first is null) return NotFound();
        return Ok(first);
    }

    [HttpPost("submit")]
    public async Task<IActionResult> Submit(SubmitIntakeFormRequest req)
    {
        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(a => a.Id == req.AppointmentId
                && a.CancellationToken == req.CancellationToken);

        if (appointment is null) return NotFound();

        // Uniqueness is now (appointmentId, formId) — clients can re-submit the
        // same form and we update in place, but different forms for the same
        // appointment get their own rows.
        var existing = await _db.IntakeFormResponses
            .FirstOrDefaultAsync(r => r.AppointmentId == req.AppointmentId
                && r.PracticeFormId == req.PracticeFormId);

        if (existing is not null)
        {
            existing.ResponsesJson = req.ResponsesJson;
            existing.SubmittedAt = DateTime.UtcNow;
        }
        else
        {
            _db.IntakeFormResponses.Add(new IntakeFormResponse
            {
                AppointmentId = req.AppointmentId,
                PracticeFormId = req.PracticeFormId,
                ResponsesJson = req.ResponsesJson
            });
        }

        await _db.SaveChangesAsync();

        // Notify provider that a form was submitted.
        _ = Task.Run(async () =>
        {
            var appt = await _db.Appointments
                .Include(a => a.Client)
                .Include(a => a.Provider)
                .Include(a => a.AppointmentType)
                .FirstOrDefaultAsync(a => a.Id == req.AppointmentId);

            if (appt?.Provider is null) return;

            var notifSettings = await _db.NotificationSettings.FirstOrDefaultAsync(n => n.PracticeId == appt.PracticeId);
            if (notifSettings?.EmailEnabled != false && !string.IsNullOrWhiteSpace(appt.Provider.Email))
            {
                await _email.SendIntakeSubmittedToProviderAsync(
                    appt.Provider.Email!,
                    appt.Provider.GetDisplayName(),
                    $"{appt.Client.FirstName} {appt.Client.LastName}",
                    appt.AppointmentType.Name,
                    appt.StartTime,
                    notifSettings?.FromEmail,
                    notifSettings?.FromName
                );
            }
        });

        return NoContent();
    }
}
