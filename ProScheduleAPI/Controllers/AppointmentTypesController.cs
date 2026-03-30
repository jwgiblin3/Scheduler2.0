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
        var types = await _db.AppointmentTypes
            .Where(a => a.PracticeId == PracticeId)
            .ToListAsync();

        return Ok(types.Select(ToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AppointmentTypeDto>> GetById(int id)
    {
        var type = await _db.AppointmentTypes
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
            .FirstOrDefaultAsync(a => a.PracticeId == PracticeId && a.Id == id);

        if (type is null) return NotFound();

        type.Name = req.Name;
        type.Description = req.Description;
        type.DurationMinutes = req.DurationMinutes;
        type.BufferBeforeMinutes = req.BufferBeforeMinutes;
        type.BufferAfterMinutes = req.BufferAfterMinutes;
        type.RequiresIntakeForm = req.RequiresIntakeForm;
        type.IsActive = req.IsActive;

        await _db.SaveChangesAsync();
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
        a.RequiresIntakeForm, a.IsActive
    );
}
