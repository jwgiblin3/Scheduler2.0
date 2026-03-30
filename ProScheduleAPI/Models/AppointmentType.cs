namespace ProScheduleAPI.Models;

public class AppointmentType
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DurationMinutes { get; set; } = 60;
    public int BufferBeforeMinutes { get; set; } = 0;
    public int BufferAfterMinutes { get; set; } = 0;
    public bool RequiresIntakeForm { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProviderAppointmentType> ProviderAppointmentTypes { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];
    public IntakeForm? IntakeForm { get; set; }
}
