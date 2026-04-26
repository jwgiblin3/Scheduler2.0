using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

public class NotificationSettings
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    // Reminder hours before appointment
    public int Reminder1Hours { get; set; } = 48;
    public int Reminder2Hours { get; set; } = 24;

    // Channels enabled
    public bool EmailEnabled { get; set; } = true;
    public bool SmsEnabled { get; set; } = false;

    // From address/name for emails. Length caps per ADR-001 §6.
    [Required, EmailAddress, MaxLength(254)]
    public string FromEmail { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string FromName { get; set; } = string.Empty;
}
