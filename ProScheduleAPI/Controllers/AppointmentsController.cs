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
public class AppointmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AvailabilityService _availability;
    private readonly EmailService _email;
    private readonly SmsService _sms;

    public AppointmentsController(AppDbContext db, AvailabilityService availability, EmailService email, SmsService sms)
    {
        _db = db;
        _availability = availability;
        _email = email;
        _sms = sms;
    }

    private int? PracticeId
    {
        get
        {
            // Client-only users have no practiceId claim — don't crash on them.
            var raw = User.FindFirstValue("practiceId");
            return int.TryParse(raw, out var pid) ? pid : null;
        }
    }

    /// <summary>Currently signed-in AspNetUsers.Id, or null if unauthenticated.
    /// Prefers the custom "userId" claim and falls back to the standard NameIdentifier.</summary>
    private int? CurrentUserId
    {
        get
        {
            var raw = User.FindFirstValue("userId") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(raw, out var id) ? id : null;
        }
    }

    // GET api/appointments — admin/staff view
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<AppointmentSummaryDto>>> GetAll(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? providerId,
        [FromQuery] int? appointmentTypeId,
        [FromQuery] AppointmentStatus? status)
    {
        var practiceId = PracticeId!.Value;

        var query = _db.Appointments
            .Where(a => a.PracticeId == practiceId)
            .Include(a => a.Client)
            .Include(a => a.Provider)
            .Include(a => a.AppointmentType)
            .Include(a => a.IntakeFormResponses)
            .AsQueryable();

        if (from.HasValue) query = query.Where(a => a.StartTime >= from.Value);
        if (to.HasValue) query = query.Where(a => a.StartTime <= to.Value);
        if (providerId.HasValue) query = query.Where(a => a.ProviderId == providerId.Value);
        if (appointmentTypeId.HasValue) query = query.Where(a => a.AppointmentTypeId == appointmentTypeId.Value);
        if (status.HasValue) query = query.Where(a => a.Status == status.Value);

        var appointments = await query.OrderBy(a => a.StartTime).ToListAsync();

        return Ok(appointments.Select(a => new AppointmentSummaryDto(
            a.Id,
            $"{a.Client.FirstName} {a.Client.LastName}",
            a.Client.Email,
            a.Provider.GetDisplayName(),
            a.AppointmentType.Name,
            a.StartTime,
            a.EndTime,
            a.Status,
            a.IntakeFormResponses.Any()
        )));
    }

    // GET api/appointments/me — signed-in client's appointments across all practices.
    // Declared BEFORE [HttpGet("{id}")] so the literal "me" wins over the int id binding.
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<List<MyAppointmentDto>>> GetMine()
    {
        if (CurrentUserId is not int userId) return Unauthorized();

        // Materialize first — GetDisplayName() is a C# extension method and
        // can't be translated to SQL, so the projection must happen in memory.
        var rows = await _db.Appointments
            .AsNoTracking()
            .Where(a => a.Client.AppUserId == userId)
            .Include(a => a.Client).ThenInclude(c => c.Practice)
            .Include(a => a.Provider)
            .Include(a => a.AppointmentType)
            .OrderByDescending(a => a.StartTime)
            .ToListAsync();

        var appts = rows.Select(a => new MyAppointmentDto(
            a.Id,
            a.Client.Practice.Name,
            a.Client.Practice.Slug,
            a.ProviderId,
            a.Provider.GetDisplayName(),
            a.AppointmentTypeId,
            a.AppointmentType.Name,
            a.StartTime,
            a.EndTime,
            a.Status,
            a.CancellationToken
        )).ToList();

        return Ok(appts);
    }

    [HttpGet("{id:int}")]
    [Authorize]
    public async Task<ActionResult<AppointmentDetailDto>> GetById(int id)
    {
        var a = await _db.Appointments
            .Where(x => x.PracticeId == PracticeId!.Value && x.Id == id)
            .Include(x => x.Client)
            .Include(x => x.Provider)
            .Include(x => x.AppointmentType)
            .Include(x => x.IntakeFormResponses).ThenInclude(r => r.PracticeForm)
            .FirstOrDefaultAsync();

        if (a is null) return NotFound();

        // Project every submitted response, most-recent first, plus a
        // singular alias for the legacy single-form rendering path. The
        // alias is just `responses[0]` when the list is non-empty.
        var responses = a.IntakeFormResponses
            .OrderByDescending(r => r.SubmittedAt)
            .Select(BuildIntakeResponseDto)
            .ToList();

        return Ok(new AppointmentDetailDto(
            a.Id,
            a.ClientId,
            $"{a.Client.FirstName} {a.Client.LastName}",
            a.Client.Email,
            a.Client.Phone ?? "",
            a.ProviderId,
            a.Provider.GetDisplayName(),
            a.AppointmentTypeId,
            a.AppointmentType.Name,
            a.AppointmentType.DurationMinutes,
            a.StartTime,
            a.EndTime,
            a.Status,
            a.Notes,
            // "hasIntakeResponse" is true when at least one form has been submitted.
            responses.Count > 0,
            // Singular kept for back-compat. New UI reads IntakeResponses.
            responses.Count > 0 ? responses[0] : null,
            responses
        ));
    }

    // Booking endpoint — requires a signed-in account (guest bookings are disabled).
    // The [Authorize] ensures CurrentUserId is always set, so every Client row
    // created here gets properly linked to an AspNetUsers account.
    [HttpPost("book")]
    [Authorize]
    public async Task<ActionResult> Book([FromQuery] string practiceSlug, CreateAppointmentRequest req)
    {
        if (CurrentUserId is not int bookingUserId)
            return Unauthorized("You must be signed in to book an appointment.");

        var practice = await _db.Practices.FirstOrDefaultAsync(p => p.Slug == practiceSlug);
        if (practice is null) return NotFound("Practice not found.");

        var slots = await _availability.GetAvailableSlotsAsync(
            req.ProviderId, req.AppointmentTypeId, DateOnly.FromDateTime(req.StartTime));

        bool slotAvailable = slots.Any(s => s.Start == req.StartTime);
        if (!slotAvailable) return BadRequest("Selected time slot is not available.");

        var apptType = await _db.AppointmentTypes.FindAsync(req.AppointmentTypeId);
        if (apptType is null) return BadRequest("Invalid appointment type.");

        // Find or create the Client row. Prefer matching by AppUserId (so a user
        // who changes email addresses still sees all their appointments).
        // Fall back to email within the same practice for legacy rows.
        Console.WriteLine($"[Book] practice={practice.Slug} userId={bookingUserId} email={req.ClientEmail}");

        var client = await _db.Clients.FirstOrDefaultAsync(c =>
                c.PracticeId == practice.Id && c.AppUserId == bookingUserId)
            ?? await _db.Clients.FirstOrDefaultAsync(c =>
                c.PracticeId == practice.Id && c.Email == req.ClientEmail);

        if (client is null)
        {
            client = new Client
            {
                PracticeId = practice.Id,
                AppUserId = bookingUserId,
                FirstName = req.ClientFirstName,
                LastName = req.ClientLastName,
                Email = req.ClientEmail,
                Phone = req.ClientPhone,
                SmsOptIn = req.SmsOptIn
            };
            _db.Clients.Add(client);
            await _db.SaveChangesAsync();
            Console.WriteLine($"[Book] created new Client id={client.Id} AppUserId={client.AppUserId}");
        }
        else if (client.AppUserId is null)
        {
            // Guest client row matched by email — claim it for this signed-in user.
            client.AppUserId = bookingUserId;
            await _db.SaveChangesAsync();
            Console.WriteLine($"[Book] claimed existing Client id={client.Id} -> AppUserId={bookingUserId}");
        }
        else
        {
            Console.WriteLine($"[Book] reusing Client id={client.Id} AppUserId={client.AppUserId}");
        }

        // Persist the phone onto the AppUser record too, so future sign-ins
        // surface it via AuthResponse.Phone and the booking widget can
        // pre-fill it on the next visit. Only fill if the AppUser doesn't
        // already have a phone — never overwrite, since the user may have
        // explicitly set a different number on their profile.
        if (!string.IsNullOrWhiteSpace(req.ClientPhone))
        {
            var appUser = await _db.Users.FindAsync(bookingUserId);
            if (appUser is not null && string.IsNullOrWhiteSpace(appUser.PhoneNumber))
            {
                appUser.PhoneNumber = req.ClientPhone.Trim();
                await _db.SaveChangesAsync();
            }
        }

        var appointment = new Appointment
        {
            PracticeId = practice.Id,
            ClientId = client.Id,
            ProviderId = req.ProviderId,
            AppointmentTypeId = req.AppointmentTypeId,
            StartTime = req.StartTime,
            EndTime = req.StartTime.AddMinutes(apptType.DurationMinutes),
            Notes = req.Notes,
            CancellationToken = Guid.NewGuid().ToString("N")
        };

        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();

        // Load provider for notifications
        var provider = await _db.Providers.FindAsync(req.ProviderId);
        var notifSettings = await _db.NotificationSettings.FirstOrDefaultAsync(n => n.PracticeId == practice.Id);

        // Fire-and-forget notifications
        _ = Task.Run(async () =>
        {
            var fromEmail = notifSettings?.FromEmail;
            var fromName = notifSettings?.FromName;
            var clientName = $"{client.FirstName} {client.LastName}";
            var providerName = provider?.GetDisplayName() ?? "";

            if (notifSettings?.EmailEnabled != false)
            {
                await _email.SendBookingConfirmationAsync(client.Email, clientName, providerName,
                    apptType.Name, appointment.StartTime, practice.Slug, appointment.CancellationToken!,
                    practice.Name,
                    practice.AddressLine1, practice.City, practice.State, practice.PostalCode,
                    fromEmail, fromName);

                // Provider email is now optional — only notify if one is set.
                if (provider is not null && !string.IsNullOrWhiteSpace(provider.Email))
                    await _email.SendNewBookingToProviderAsync(provider.Email!, providerName,
                        clientName, client.Email, apptType.Name, appointment.StartTime, fromEmail, fromName);
            }

            if (notifSettings?.SmsEnabled == true && client.SmsOptIn && !string.IsNullOrEmpty(client.Phone))
                await _sms.SendBookingConfirmationAsync(client.Phone, client.FirstName, apptType.Name, appointment.StartTime);
        });

        return Ok(new
        {
            appointment.Id,
            appointment.CancellationToken,
            appointment.StartTime,
            appointment.EndTime,
            RequiresIntakeForm = apptType.RequiresIntakeForm
        });
    }

    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel(CancelRequest req)
    {
        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(a => a.CancellationToken == req.CancellationToken
                && a.Status == AppointmentStatus.Scheduled);

        if (appointment is null) return NotFound();

        var practice = await _db.Practices.FindAsync(appointment.PracticeId);
        var cutoff = DateTime.UtcNow.AddHours(practice!.CancellationWindowHours);

        if (appointment.StartTime < cutoff)
            return BadRequest($"Cancellations must be made at least {practice.CancellationWindowHours} hours in advance.");

        appointment.Status = AppointmentStatus.Cancelled;
        await _db.SaveChangesAsync();

        // Notify client and provider of cancellation
        var client = await _db.Clients.FindAsync(appointment.ClientId);
        var provider = await _db.Providers.FindAsync(appointment.ProviderId);
        var apptType = await _db.AppointmentTypes.FindAsync(appointment.AppointmentTypeId);
        var notifSettings = await _db.NotificationSettings.FirstOrDefaultAsync(n => n.PracticeId == appointment.PracticeId);

        _ = Task.Run(async () =>
        {
            if (client is null || apptType is null) return;
            var fromEmail = notifSettings?.FromEmail;
            var fromName = notifSettings?.FromName;
            var clientName = $"{client.FirstName} {client.LastName}";

            if (notifSettings?.EmailEnabled != false)
            {
                await _email.SendCancellationToClientAsync(client.Email, clientName, apptType.Name, appointment.StartTime, fromEmail, fromName);
                if (provider is not null && !string.IsNullOrWhiteSpace(provider.Email))
                    await _email.SendCancellationToProviderAsync(provider.Email!,
                        provider.GetDisplayName(), clientName, apptType.Name, appointment.StartTime, fromEmail, fromName);
            }

            if (notifSettings?.SmsEnabled == true && client.SmsOptIn && !string.IsNullOrEmpty(client.Phone))
                await _sms.SendCancellationAsync(client.Phone, client.FirstName, apptType.Name);
        });

        return NoContent();
    }

    [HttpPost("reschedule")]
    public async Task<IActionResult> Reschedule(RescheduleRequest req)
    {
        var appointment = await _db.Appointments
            .Include(a => a.AppointmentType)
            .FirstOrDefaultAsync(a => a.CancellationToken == req.CancellationToken
                && a.Status == AppointmentStatus.Scheduled);

        if (appointment is null) return NotFound();

        var slots = await _availability.GetAvailableSlotsAsync(
            appointment.ProviderId,
            appointment.AppointmentTypeId,
            DateOnly.FromDateTime(req.NewStartTime));

        if (!slots.Any(s => s.Start == req.NewStartTime))
            return BadRequest("Selected time slot is not available.");

        appointment.StartTime = req.NewStartTime;
        appointment.EndTime = req.NewStartTime.AddMinutes(appointment.AppointmentType.DurationMinutes);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<IActionResult> UpdateStatus(int id, UpdateAppointmentRequest req)
    {
        var appointment = await _db.Appointments
            .FirstOrDefaultAsync(a => a.PracticeId == PracticeId!.Value && a.Id == id);

        if (appointment is null) return NotFound();

        appointment.Status = req.Status;
        if (req.Notes is not null) appointment.Notes = req.Notes;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET available slots — public
    [HttpGet("availability")]
    public async Task<ActionResult<List<AvailableSlotDto>>> GetAvailability(
        [FromQuery] int providerId,
        [FromQuery] int appointmentTypeId,
        [FromQuery] DateOnly date)
    {
        var slots = await _availability.GetAvailableSlotsAsync(providerId, appointmentTypeId, date);
        return Ok(slots);
    }

    // GET api/appointments/export — CSV download
    [HttpGet("export")]
    [Authorize]
    public async Task<IActionResult> Export(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? providerId,
        [FromQuery] int? appointmentTypeId,
        [FromQuery] AppointmentStatus? status)
    {
        var practiceId = PracticeId!.Value;

        var query = _db.Appointments
            .Where(a => a.PracticeId == practiceId)
            .Include(a => a.Client)
            .Include(a => a.Provider)
            .Include(a => a.AppointmentType)
            .AsQueryable();

        if (from.HasValue) query = query.Where(a => a.StartTime >= from.Value);
        if (to.HasValue) query = query.Where(a => a.StartTime <= to.Value);
        if (providerId.HasValue) query = query.Where(a => a.ProviderId == providerId.Value);
        if (appointmentTypeId.HasValue) query = query.Where(a => a.AppointmentTypeId == appointmentTypeId.Value);
        if (status.HasValue) query = query.Where(a => a.Status == status.Value);

        var appointments = await query.OrderBy(a => a.StartTime).ToListAsync();

        var csv = new System.Text.StringBuilder();
        csv.AppendLine("ID,Date,Start Time,End Time,Client Name,Client Email,Client Phone,Provider,Appointment Type,Duration (min),Status,Notes");

        foreach (var a in appointments)
        {
            csv.AppendLine(string.Join(",",
                a.Id,
                a.StartTime.ToString("yyyy-MM-dd"),
                a.StartTime.ToString("HH:mm"),
                a.EndTime.ToString("HH:mm"),
                $"\"{a.Client.FirstName} {a.Client.LastName}\"",
                a.Client.Email,
                a.Client.Phone ?? "",
                $"\"{a.Provider.GetDisplayName()}\"",
                $"\"{a.AppointmentType.Name}\"",
                a.AppointmentType.DurationMinutes,
                a.Status.ToString(),
                $"\"{a.Notes?.Replace("\"", "\"\"") ?? ""}\""
            ));
        }

        var bytes = System.Text.Encoding.UTF8.GetBytes(csv.ToString());
        return File(bytes, "text/csv", $"appointments-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    // GET api/appointments/client/{clientId} — appointment history per client
    [HttpGet("client/{clientId}")]
    [Authorize]
    public async Task<ActionResult<List<AppointmentSummaryDto>>> GetByClient(int clientId)
    {
        var practiceId = PracticeId!.Value;

        var appointments = await _db.Appointments
            .Where(a => a.PracticeId == practiceId && a.ClientId == clientId)
            .Include(a => a.Client)
            .Include(a => a.Provider)
            .Include(a => a.AppointmentType)
            .Include(a => a.IntakeFormResponses)
            .OrderByDescending(a => a.StartTime)
            .ToListAsync();

        return Ok(appointments.Select(a => new AppointmentSummaryDto(
            a.Id,
            $"{a.Client.FirstName} {a.Client.LastName}",
            a.Client.Email,
            a.Provider.GetDisplayName(),
            a.AppointmentType.Name,
            a.StartTime,
            a.EndTime,
            a.Status,
            a.IntakeFormResponses.Any()
        )));
    }

    /**
     * Build the (optional) intake-response DTO with SubmittedAt explicitly
     * marked as UTC. SQL Server's datetime2 column drops the DateTimeKind,
     * so values come back out of EF with Kind=Unspecified — which the JSON
     * serializer emits without a "Z" suffix. The Angular DatePipe then
     * interprets that string as local time and displays the UTC value
     * verbatim. Marking it Utc here makes the API output correct, and the
     * browser converts to the viewer's local timezone on render.
     */
    private static IntakeFormResponseDto BuildIntakeResponseDto(IntakeFormResponse r)
    {
        var submittedUtc = DateTime.SpecifyKind(r.SubmittedAt, DateTimeKind.Utc);
        // r.PracticeForm is loaded via .ThenInclude in GetById; can still be
        // null for legacy responses written before the forms library shipped.
        return new IntakeFormResponseDto(
            r.Id, r.ResponsesJson, submittedUtc,
            r.PracticeForm?.Name, r.PracticeFormId);
    }
}
