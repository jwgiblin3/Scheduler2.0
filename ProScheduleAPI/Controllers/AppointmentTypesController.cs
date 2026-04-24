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
public class AppointmentTypesController : ControllerBase
{
    private readonly AppDbContext _db;
    public AppointmentTypesController(AppDbContext db) => _db = db;

    private int PracticeId => int.Parse(User.FindFirstValue("practiceId")!);

    [HttpGet]
    public async Task<ActionResult<List<AppointmentTypeDto>>> GetAll()
    {
        // Eager-load form attachments so the DTO carries each type's formIds
        // without a per-row follow-up query.
        var types = await _db.AppointmentTypes
            .Where(a => a.PracticeId == PracticeId)
            .Include(a => a.AppointmentTypeForms)
            .ToListAsync();

        return Ok(types.Select(ToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AppointmentTypeDto>> GetById(int id)
    {
        var type = await _db.AppointmentTypes
            .Include(a => a.AppointmentTypeForms)
            .FirstOrDefaultAsync(a => a.PracticeId == PracticeId && a.Id == id);

        if (type is null) return NotFound();
        return Ok(ToDto(type));
    }

    [HttpPost]
    public async Task<ActionResult<AppointmentTypeDto>> Create(CreateAppointmentTypeRequest req)
    {
        var type = new AppointmentType
        {
            PracticeId = PracticeId,
            Name = req.Name,
            Description = req.Description,
            DurationMinutes = req.DurationMinutes,
            BufferBeforeMinutes = req.BufferBeforeMinutes,
            BufferAfterMinutes = req.BufferAfterMinutes,
            RequiresIntakeForm = req.RequiresIntakeForm
        };

        _db.AppointmentTypes.Add(type);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = type.Id }, ToDto(type));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<AppointmentTypeDto>> Update(int id, UpdateAppointmentTypeRequest req)
    {
        var type = await _db.AppointmentTypes
            .Include(a => a.AppointmentTypeForms)
            .FirstOrDefaultAsync(a => a.PracticeId == PracticeId && a.Id == id);

        if (type is null) return NotFound();

        type.Name = req.Name;
        type.Description = req.Description;
        type.DurationMinutes = req.DurationMinutes;
        type.BufferBeforeMinutes = req.BufferBeforeMinutes;
        type.BufferAfterMinutes = req.BufferAfterMinutes;
        type.RequiresIntakeForm = req.RequiresIntakeForm;
        type.IsActive = req.IsActive;

        // When FormIds is provided, replace the attachment set entirely. Guard
        // against foreign-practice form IDs so one admin can't attach another
        // practice's forms by guessing numbers.
        if (req.FormIds is not null)
        {
            var requested = req.FormIds.Distinct().ToArray();
            var valid = await _db.PracticeForms
                .Where(f => f.PracticeId == PracticeId && requested.Contains(f.Id))
                .Select(f => f.Id)
                .ToListAsync();

            _db.AppointmentTypeForms.RemoveRange(type.AppointmentTypeForms);

            // Preserve the order the admin specified — SortOrder is the index
            // in the incoming array.
            var order = 0;
            foreach (var formId in req.FormIds)
            {
                if (!valid.Contains(formId)) continue;
                _db.AppointmentTypeForms.Add(new AppointmentTypeForm
                {
                    AppointmentTypeId = type.Id,
                    PracticeFormId = formId,
                    SortOrder = order++
                });
            }
        }

        await _db.SaveChangesAsync();

        // Re-load attachments for the response DTO.
        await _db.Entry(type).Collection(t => t.AppointmentTypeForms).LoadAsync();
        return Ok(ToDto(type));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var type = await _db.AppointmentTypes
            .FirstOrDefaultAsync(a => a.PracticeId == PracticeId && a.Id == id);

        if (type is null) return NotFound();

        type.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static AppointmentTypeDto ToDto(AppointmentType a) => new(
        a.Id, a.Name, a.Description, a.DurationMinutes,
        a.BufferBeforeMinutes, a.BufferAfterMinutes,
        a.RequiresIntakeForm, a.IsActive,
        a.AppointmentTypeForms
            .OrderBy(x => x.SortOrder)
            .Select(x => x.PracticeFormId)
            .ToArray()
    );
}
