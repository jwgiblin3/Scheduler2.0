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
    public string? Notes { get; set; }
    public string? CancellationToken { get; set; } // unique token for client-facing cancel/reschedule links
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public IntakeFormResponse? IntakeFormResponse { get; set; }
}

public enum AppointmentStatus
{
    Scheduled = 0,
    Completed = 1,
    Cancelled = 2,
    NoShow = 3
}
