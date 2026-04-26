using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

public class Appointment
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public int ClientId { get; set; }
    public Client Client { get; set; } = null!;
    public int ProviderId { get; set; }
    public Provider Provider { get; set; } = null!;
    public int AppointmentTypeId { get; set; }
    public AppointmentType AppointmentType { get; set; } = null!;
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public AppointmentStatus Status { get; set; } = AppointmentStatus.Scheduled;

    // Length caps per ADR-001 §6. Notes is the generic free-text cap (2000).
    // CancellationToken is generated server-side as a GUID-shaped string
    // (~36 chars), so 64 leaves headroom without overcommitting.
    [MaxLength(2000)]
    public string? Notes { get; set; }

    [MaxLength(64)]
    public string? CancellationToken { get; set; } // unique token for client-facing cancel/reschedule links
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Submitted form responses. One row per form the client completes — an
    /// appointment tied to a type with both a Waiver and Intake form attached
    /// will have two rows here once both are filled in.
    /// </summary>
    public ICollection<IntakeFormResponse> IntakeFormResponses { get; set; } = [];
}

public enum AppointmentStatus
{
    Scheduled = 0,
    Completed = 1,
    Cancelled = 2,
    NoShow = 3
}
