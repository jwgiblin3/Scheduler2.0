using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

public class AvailabilityService
{
    private readonly AppDbContext _db;

    public AvailabilityService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<AvailableSlotDto>> GetAvailableSlotsAsync(
        int providerId,
        int appointmentTypeId,
        DateOnly date)
    {
        var provider = await _db.Providers
            .Include(p => p.Availabilities)
            .FirstOrDefaultAsync(p => p.Id == providerId && p.IsActive);

        if (provider is null) return [];

        var apptType = await _db.AppointmentTypes
            .FirstOrDefaultAsync(a => a.Id == appointmentTypeId && a.IsActive);

        if (apptType is null) return [];

        var dayAvailability = provider.Availabilities
            .Where(a => a.IsActive && a.DayOfWeek == date.DayOfWeek)
            .ToList();

        if (!dayAvailability.Any()) return [];

        var existingAppointments = await _db.Appointments
            .Where(a => a.ProviderId == providerId
                && a.Status == AppointmentStatus.Scheduled
                && DateOnly.FromDateTime(a.StartTime) == date)
            .ToListAsync();

        var slots = new List<AvailableSlotDto>();
        var totalDuration = apptType.DurationMinutes + apptType.BufferBeforeMinutes + apptType.BufferAfterMinutes;

        foreach (var avail in dayAvailability)
        {
            var current = date.ToDateTime(avail.StartTime);
            var end = date.ToDateTime(avail.EndTime);

            while (current.AddMinutes(totalDuration) <= end)
            {
                var slotStart = current.AddMinutes(apptType.BufferBeforeMinutes);
                var slotEnd = slotStart.AddMinutes(apptType.DurationMinutes);
                var blockStart = current;
                var blockEnd = current.AddMinutes(totalDuration);

                bool hasConflict = existingAppointments.Any(a =>
                {
                    var existingStart = a.StartTime.AddMinutes(-apptType.BufferBeforeMinutes);
                    var existingEnd = a.EndTime.AddMinutes(apptType.BufferAfterMinutes);
                    return blockStart < existingEnd && blockEnd > existingStart;
                });

                if (!hasConflict && slotStart > DateTime.UtcNow)
                {
                    slots.Add(new AvailableSlotDto(slotStart, slotEnd));
                }

                current = current.AddMinutes(apptType.DurationMinutes + apptType.BufferAfterMinutes);
            }
        }

        return slots;
    }
}
