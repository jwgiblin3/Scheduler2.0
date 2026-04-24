namespace ProScheduleAPI.Models;

/// <summary>
/// A reusable form owned by a practice. Multiple appointment types can
/// attach the same form, so a single "Waiver" or "New Customer" form defined
/// once can be required on many types without duplicating the definition.
/// </summary>
public class PracticeForm
{
    public int Id { get; set; }

    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    /// <summary>User-visible name shown in the admin library and to clients.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Serialized array of IntakeFormField — identical shape to the legacy IntakeForm.</summary>
    public string FieldsJson { get; set; } = "[]";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AppointmentTypeForm> AppointmentTypeForms { get; set; } = [];
}
