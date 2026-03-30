namespace ProScheduleAPI.Models;

public class Provider
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Bio { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProviderAvailability> Availabilities { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];
    public ICollection<ProviderAppointmentType> ProviderAppointmentTypes { get; set; } = [];
}
