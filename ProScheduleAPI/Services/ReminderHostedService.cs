using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

public class ReminderHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReminderHostedService> _logger;

    public ReminderHostedService(IServiceScopeFactory scopeFactory, ILogger<ReminderHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await SendDueRemindersAsync();
            // Check every 15 minutes
            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }

    private async Task SendDueRemindersAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();
        var sms = scope.ServiceProvider.GetRequiredService<SmsService>();

        // Load all practices with their notification settings
        var practices = await db.Practices
            .Include(p => p.NotificationSettings)
            .ToListAsync();

        foreach (var practice in practices)
        {
            var settings = practice.NotificationSettings;
            if (settings is null || !settings.EmailEnabled) continue;

            var reminderWindows = new[] { settings.Reminder1Hours, settings.Reminder2Hours };

            foreach (var hours in reminderWindows)
            {
                var windowStart = DateTime.UtcNow.AddHours(hours - 0.25);
                var windowEnd = DateTime.UtcNow.AddHours(hours + 0.25);

                var appointments = await db.Appointments
                    .Where(a => a.PracticeId == practice.Id
                        && a.Status == AppointmentStatus.Scheduled
                        && a.StartTime >= windowStart
                        && a.StartTime <= windowEnd)
                    .Include(a => a.Client)
                    .Include(a => a.Provider)
                    .Include(a => a.AppointmentType)
                    .ToListAsync();

                foreach (var appt in appointments)
                {
                    try
                    {
                        if (settings.EmailEnabled)
                        {
                            await email.SendReminderAsync(
                                appt.Client.Email,
                                $"{appt.Client.FirstName} {appt.Client.LastName}",
                                $"{appt.Provider.FirstName} {appt.Provider.LastName}",
                                appt.AppointmentType.Name,
                                appt.StartTime,
                                practice.Slug,
                                appt.CancellationToken!,
                                hours,
                                settings.FromEmail.Length > 0 ? settings.FromEmail : null,
                                settings.FromName.Length > 0 ? settings.FromName : null
                            );
                        }

                        if (settings.SmsEnabled && appt.Client.SmsOptIn && !string.IsNullOrEmpty(appt.Client.Phone))
                        {
                            await sms.SendReminderAsync(
                                appt.Client.Phone,
                                appt.Client.FirstName,
                                appt.AppointmentType.Name,
                                appt.StartTime,
                                hours
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error sending reminder for appointment {Id}", appt.Id);
                    }
                }
            }
        }
    }
}
