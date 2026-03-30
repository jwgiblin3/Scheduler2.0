using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class IntakeFormsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    public IntakeFormsController(AppDbContext db, EmailService email) { _db = db; _email = email; }

    private int? PracticeId => User.Identity?.IsAuthenticated == true
        ? int.Parse(User.FindFirstValue("practiceId")!)
        : null;

    [HttpGet("appointment-type/{appointmentTypeId}")]
    [Authorize]
    public async Task<ActionResult<IntakeFormDto>> GetByAppointmentType(int appointmentTypeId)
    {
        var form = await _db.IntakeForms
            .Include(f => f.AppointmentType)
            .FirstOrDefaultAsync(f => f.AppointmentTypeId == appointmentTypeId
                && f.AppointmentType.PracticeId == PracticeId!.Value);

        if (form is null) return NotFound();
        return Ok(new IntakeFormDto(form.Id, form.AppointmentTypeId, form.Title, form.FieldsJson));
    }

    // Public endpoint for client to retrieve the form before booking
    [HttpGet("public/{appointmentTypeId}")]
    public async Task<ActionResult<IntakeFormDto>> GetPublic(int appointmentTypeId)
    {
        var form = await _db.IntakeForms
            .FirstOrDefaultAsync(f => f.AppointmentTypeId == appointmentTypeId);

        if (form is null) return NotFound();
        return Ok(new IntakeFormDto(form.Id, form.AppointmentTypeId, form.Title, form.FieldsJson));
    }

    [HttpPut("appointment-type/{appointmentTypeId}")]
    [Authorize]
    public async Task<ActionResult<IntakeFormDto>> Save(int appointmentTypeId, SaveIntakeFormRequest req)
    {
        var apptType = await _db.AppointmentTypes
            .FirstOrDefaultAsync(a => a.Id == appointmentTypeId && a.PracticeId == PracticeId!.Value);

        if (apptType is null) return NotFound();

        var form = await _db.IntakeForms.FirstOrDefaultAsync(f => f.AppointmentTypeId == appointmentTypeId);

        if (form is null)
        {
            form = new IntakeForm { AppointmentTypeId = appointmentTypeId };
            _db.IntakeForms.Add(form);
        }

        form.Title = req.Title;
        form.FieldsJson = req.FieldsJson;
        form.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new IntakeFormDto(form.Id, form.AppointmentTypeId, form.Title, form.FieldsJson));
    }

    // Public: client submits intake form
    [HttpPost("submit")]
    public async Task<IActionResult> Submit(SubmitIntakeFormRequest req)
    {
        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(a => a.Id == req.AppointmentId
                && a.CancellationToken == req.CancellationToken);

        if (appointment is null) return NotFound();

        var existing = await _db.IntakeFormResponses
            .FirstOrDefaultAsync(r => r.AppointmentId == req.AppointmentId);

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
                ResponsesJson = req.ResponsesJson
            });
        }

        await _db.SaveChangesAsync();

        // Notify provider that intake was submitted
        _ = Task.Run(async () =>
        {
            var appt = await _db.Appointments
                .Include(a => a.Client)
                .Include(a => a.Provider)
                .Include(a => a.AppointmentType)
                .FirstOrDefaultAsync(a => a.Id == req.AppointmentId);

            if (appt?.Provider is null) return;

            var notifSettings = await _db.NotificationSettings.FirstOrDefaultAsync(n => n.PracticeId == appt.PracticeId);
            if (notifSettings?.EmailEnabled != false)
            {
                await _email.SendIntakeSubmittedToProviderAsync(
                    appt.Provider.Email,
                    $"{appt.Provider.FirstName} {appt.Provider.LastName}",
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
