using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

/// <summary>
/// Practice-facing CRUD for client records. List view summarizes every client
/// the practice has ever seen; detail view rolls up their appointments and
/// submitted form responses so staff can review history in one place.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ClientsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ClientsController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);

    private string UserRole =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? User.FindFirstValue("role")
        ?? "";

    [HttpGet]
    public async Task<ActionResult<List<ClientDto>>> GetAll([FromQuery] string? search = null)
    {
        // Left-join appointments in a single round-trip so we can show
        // appointment count + last-visit inline without N+1.
        var query = _db.Clients
            .AsNoTracking()
            .Where(c => c.PracticeId == PracticeId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(c =>
                c.FirstName.ToLower().Contains(s)
                || c.LastName.ToLower().Contains(s)
                || c.Email.ToLower().Contains(s)
                || (c.Phone != null && c.Phone.Contains(s)));
        }

        var rows = await query
            .OrderBy(c => c.LastName).ThenBy(c => c.FirstName)
            .Select(c => new
            {
                c.Id, c.FirstName, c.LastName, c.Email, c.Phone, c.SmsOptIn, c.CreatedAt,
                AppointmentCount = c.Appointments.Count,
                LastAppointment = c.Appointments
                    .OrderByDescending(a => a.StartTime)
                    .Select(a => (DateTime?)a.StartTime)
                    .FirstOrDefault()
            })
            .ToListAsync();

        return Ok(rows.Select(r => new ClientDto(
            r.Id, r.FirstName, r.LastName, r.Email, r.Phone, r.SmsOptIn, r.CreatedAt,
            r.AppointmentCount, r.LastAppointment)));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ClientDetailDto>> GetById(int id)
    {
        var client = await _db.Clients
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.PracticeId == PracticeId);
        if (client is null) return NotFound();

        // Appointments for the client. Also eager-load the form responses
        // attached to each appointment so we can zip them into the Responses
        // list below with a form name resolved from the library.
        var appts = await _db.Appointments
            .AsNoTracking()
            .Where(a => a.ClientId == id && a.PracticeId == PracticeId)
            .Include(a => a.Provider)
            .Include(a => a.AppointmentType)
            .Include(a => a.IntakeFormResponses).ThenInclude(r => r.PracticeForm)
            .OrderByDescending(a => a.StartTime)
            .ToListAsync();

        var appointmentDtos = appts.Select(a => new ClientAppointmentDto(
            a.Id, a.StartTime, a.EndTime,
            a.Provider.GetDisplayName(),
            a.AppointmentType.Name,
            (int)a.Status,
            a.IntakeFormResponses.Any()
        )).ToList();

        var responseDtos = appts
            .SelectMany(a => a.IntakeFormResponses.Select(r => new ClientFormResponseDto(
                r.Id,
                a.Id,
                a.StartTime,
                r.PracticeFormId,
                r.PracticeForm?.Name ?? "Intake Form",
                r.SubmittedAt,
                r.ResponsesJson,
                // Fields definition is needed to render labels — when the
                // response is tied to a known form we include that form's
                // schema, else we send "[]" and the UI falls back to raw JSON.
                r.PracticeForm?.FieldsJson ?? "[]"
            )))
            .OrderByDescending(r => r.SubmittedAt)
            .ToList();

        return Ok(new ClientDetailDto(
            client.Id, client.FirstName, client.LastName, client.Email,
            client.Phone, client.SmsOptIn, client.CreatedAt,
            appointmentDtos, responseDtos));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ClientDto>> Update(int id, UpdateClientRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var client = await _db.Clients
            .FirstOrDefaultAsync(c => c.Id == id && c.PracticeId == PracticeId);
        if (client is null) return NotFound();

        // Basic validation — email is the loose de-dupe key for most practices,
        // so we sanity-check it has an @ but otherwise trust the UI.
        var email = (req.Email ?? "").Trim();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            return BadRequest("A valid email is required.");

        client.FirstName = (req.FirstName ?? "").Trim();
        client.LastName = (req.LastName ?? "").Trim();
        client.Email = email;
        client.Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim();
        client.SmsOptIn = req.SmsOptIn;

        await _db.SaveChangesAsync();

        var apptCount = await _db.Appointments.CountAsync(a => a.ClientId == id);
        var last = await _db.Appointments
            .Where(a => a.ClientId == id)
            .OrderByDescending(a => a.StartTime)
            .Select(a => (DateTime?)a.StartTime)
            .FirstOrDefaultAsync();

        return Ok(new ClientDto(
            client.Id, client.FirstName, client.LastName, client.Email,
            client.Phone, client.SmsOptIn, client.CreatedAt, apptCount, last));
    }
}
