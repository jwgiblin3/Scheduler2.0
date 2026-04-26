using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

/// <summary>
/// A client-submitted waitlist entry: "let me know if an earlier slot opens
/// up that matches my preferences." Stored at submission time; the eventual
/// notification trigger (checking on every new availability / booking change
/// and emailing matches) is a follow-up background job.
/// </summary>
public class AvailabilityAlert
{
    public int Id { get; set; }

    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    public int AppointmentTypeId { get; set; }

    /// <summary>Optional — null means "any provider who offers this type".</summary>
    public int? ProviderId { get; set; }

    // Length caps per ADR-001 §6. ClientName is one combined field (first +
    // last possibly with spaces) so 130 = 50 + 80.
    [Required, MaxLength(130)]
    public string ClientName { get; set; } = string.Empty;

    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Phone, MaxLength(20)]
    public string? Phone { get; set; }

    /// <summary>
    /// JSON blob describing the day/time preferences. Shape:
    /// {
    ///   "anyDay": bool,
    ///   "days": {
    ///      "sunday":    { "morning": bool, "day": bool, "evening": bool },
    ///      "monday":    { ... },
    ///      ...
    ///      "saturday":  { ... }
    ///   }
    /// }
    /// Stored as a string so the shape can evolve without a migration.
    /// </summary>
    public string PreferencesJson { get; set; } = "{}";

    /// <summary>False once the client has been notified / fulfilled so we stop alerting.</summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FulfilledAt { get; set; }
}
