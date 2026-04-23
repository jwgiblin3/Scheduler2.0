namespace ProScheduleAPI.Models;

public class Client
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    /// <summary>
    /// Optional link to an AspNetUsers account when the booking was made by a
    /// signed-in client. Remains NULL for legacy/guest bookings. The
    /// <c>GET /appointments/me</c> endpoint uses this to list a user's appointments
    /// across every practice they've booked at.
    /// </summary>
    public int? AppUserId { get; set; }
    public AppUser? AppUser { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public bool SmsOptIn { get; set; } = false;
    public bool PushOptIn { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Appointment> Appointments { get; set; } = [];
}
