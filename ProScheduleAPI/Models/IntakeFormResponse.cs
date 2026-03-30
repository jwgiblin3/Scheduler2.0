namespace ProScheduleAPI.Models;

public class IntakeFormResponse
{
    public int Id { get; set; }
    public int AppointmentId { get; set; }
    public Appointment Appointment { get; set; } = null!;
    public string ResponsesJson { get; set; } = "{}"; // JSON dict of fieldId -> answer
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
}
