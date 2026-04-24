using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Controllers;

/// <summary>
/// Practice-level Forms library. Each row is a reusable form definition the
/// practice can attach to one or more appointment types.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FormsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FormsController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);

    private string UserRole =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? User.FindFirstValue("role")
        ?? "";

    [HttpGet]
    public async Task<ActionResult<List<PracticeFormDto>>> GetAll()
    {
        var forms = await _db.PracticeForms
            .Where(f => f.PracticeId == PracticeId)
            .OrderBy(f => f.Name)
            .Select(f => new PracticeFormDto(f.Id, f.Name, f.FieldsJson, f.UpdatedAt))
            .ToListAsync();

        return Ok(forms);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PracticeFormDto>> GetById(int id)
    {
        var form = await _db.PracticeForms
            .FirstOrDefaultAsync(f => f.Id == id && f.PracticeId == PracticeId);
        if (form is null) return NotFound();
        return Ok(new PracticeFormDto(form.Id, form.Name, form.FieldsJson, form.UpdatedAt));
    }

    [HttpPost]
    public async Task<ActionResult<PracticeFormDto>> Create(SavePracticeFormRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Form name is required.");

        var form = new PracticeForm
        {
            PracticeId = PracticeId,
            Name = name,
            FieldsJson = string.IsNullOrWhiteSpace(req.FieldsJson) ? "[]" : req.FieldsJson,
            UpdatedAt = DateTime.UtcNow
        };
        _db.PracticeForms.Add(form);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = form.Id },
            new PracticeFormDto(form.Id, form.Name, form.FieldsJson, form.UpdatedAt));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<PracticeFormDto>> Update(int id, SavePracticeFormRequest req)
    {
        if (UserRole != "Admin") return Forbid();

        var form = await _db.PracticeForms
            .FirstOrDefaultAsync(f => f.Id == id && f.PracticeId == PracticeId);
        if (form is null) return NotFound();

        var name = (req.Name ?? "").Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Form name is required.");

        form.Name = name;
        form.FieldsJson = string.IsNullOrWhiteSpace(req.FieldsJson) ? "[]" : req.FieldsJson;
        form.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new PracticeFormDto(form.Id, form.Name, form.FieldsJson, form.UpdatedAt));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (UserRole != "Admin") return Forbid();

        var form = await _db.PracticeForms
            .Include(f => f.AppointmentTypeForms)
            .FirstOrDefaultAsync(f => f.Id == id && f.PracticeId == PracticeId);
        if (form is null) return NotFound();

        // Drop attachments first since the join FK is Restrict on delete.
        _db.AppointmentTypeForms.RemoveRange(form.AppointmentTypeForms);
        _db.PracticeForms.Remove(form);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Public endpoint — returns the forms attached to an appointment type so
    /// the booking flow can render them without needing an auth token.
    /// </summary>
    [HttpGet("public/appointment-type/{appointmentTypeId:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<List<PracticeFormDto>>> GetPublicForType(int appointmentTypeId)
    {
        var forms = await _db.AppointmentTypeForms
            .Where(x => x.AppointmentTypeId == appointmentTypeId)
            .OrderBy(x => x.SortOrder)
            .Select(x => new PracticeFormDto(
                x.PracticeForm.Id,
                x.PracticeForm.Name,
                x.PracticeForm.FieldsJson,
                x.PracticeForm.UpdatedAt))
            .ToListAsync();

        return Ok(forms);
    }
}
