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
    /// <summary>
    /// Kept as a cached flag so older code paths still work, but the source of
    /// truth is now AppointmentTypeForms.Any() — the attach table drives whether
    /// forms need to be completed for this type.
    /// </summary>
    public bool RequiresIntakeForm { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProviderAppointmentType> ProviderAppointmentTypes { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];

    /// <summary>
    /// Forms attached to this appointment type. A client booking this type
    /// will be asked to complete each attached form, in SortOrder.
    /// </summary>
    public ICollection<AppointmentTypeForm> AppointmentTypeForms { get; set; } = [];
}
