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

        // Practice-wide closures (holidays, retreats, weather days) override
        // everything — if any row covers this date, no slots can be offered.
        var practiceClosed = await _db.PracticeHolidays
            .AnyAsync(h => h.PracticeId == provider.PracticeId
                           && h.StartDate <= date
                           && h.EndDate >= date);
        if (practiceClosed) return [];

        // Provider-specific out-of-office blocks (vacation, CE, sick leave).
        var providerOut = await _db.ProviderExceptions
            .AnyAsync(e => e.ProviderId == providerId
                           && e.StartDate <= date
                           && e.EndDate >= date);
        if (providerOut) return [];

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
