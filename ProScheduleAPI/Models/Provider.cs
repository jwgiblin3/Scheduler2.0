using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

public class Provider
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    // Length caps per ADR-001 §6. Description is the bio/blurb cap (2000 —
    // long enough for a real bio, short enough that we can render the full
    // text in admin lists if needed).

    // Primary name shown to clients and in the admin UI.
    [MaxLength(80)]
    public string? DisplayName { get; set; }

    // Legacy name fields — kept nullable/optional for backward compatibility with
    // existing rows. DisplayName is now the canonical name.
    [MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength(80)]
    public string LastName { get; set; } = string.Empty;

    // Email is now optional — providers are not required to have one.
    [EmailAddress, MaxLength(254)]
    public string? Email { get; set; }

    [Phone, MaxLength(20)]
    public string? Phone { get; set; }

    /// <summary>
    /// Short description of the provider shown to clients on the public
    /// booking page (credentials, specialties, a brief blurb). Previously
    /// named "Bio" in both the model and the DB.
    /// </summary>
    [MaxLength(2000)]
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProviderAvailability> Availabilities { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];
    public ICollection<ProviderAppointmentType> ProviderAppointmentTypes { get; set; } = [];
    public ICollection<ProviderException> Exceptions { get; set; } = [];
}
