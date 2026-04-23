namespace ProScheduleAPI.Models;

public class Provider
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    // Primary name shown to clients and in the admin UI.
    public string? DisplayName { get; set; }

    // Legacy name fields — kept nullable/optional for backward compatibility with
    // existing rows. DisplayName is now the canonical name.
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;

    // Email is now optional — providers are not required to have one.
    public string? Email { get; set; }
    public string? Phone { get; set; }

    /// <summary>
    /// Short description of the provider shown to clients on the public
    /// booking page (credentials, specialties, a brief blurb). Previously
    /// named "Bio" in both the model and the DB.
    /// </summary>
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProviderAvailability> Availabilities { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];
    public ICollection<ProviderAppointmentType> ProviderAppointmentTypes { get; set; } = [];
    public ICollection<ProviderException> Exceptions { get; set; } = [];
}
