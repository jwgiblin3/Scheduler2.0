using System.ComponentModel.DataAnnotations;

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

    // Length caps per ADR-001 §6. Email cap matches RFC 5321 (254).
    // Last name allows 80 to accommodate compound names ("van der Berg").
    [Required, MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string LastName { get; set; } = string.Empty;

    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Phone, MaxLength(20)]
    public string? Phone { get; set; }
    public bool SmsOptIn { get; set; } = false;
    public bool PushOptIn { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Appointment> Appointments { get; set; } = [];
}
