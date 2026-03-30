namespace ProScheduleAPI.Models;

public class Practice
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty; // public booking URL segment
    public string AdminEmail { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? TimeZone { get; set; } = "America/New_York";
    public int CancellationWindowHours { get; set; } = 24;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Provider> Providers { get; set; } = [];
    public ICollection<AppointmentType> AppointmentTypes { get; set; } = [];
    public ICollection<Client> Clients { get; set; } = [];
    public ICollection<AppUser> Users { get; set; } = [];
    public NotificationSettings? NotificationSettings { get; set; }
}
