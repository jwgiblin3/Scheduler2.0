using System.Text.Json;

namespace ProScheduleAPI.Models;

public class IntakeForm
{
    public int Id { get; set; }
    public int AppointmentTypeId { get; set; }
    public AppointmentType AppointmentType { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string FieldsJson { get; set; } = "[]"; // JSON array of IntakeFormField
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class IntakeFormField
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Label { get; set; } = string.Empty;
    public string Type { get; set; } = "text"; // text, textarea, radio, checkbox, date, signature
    public bool Required { get; set; } = false;
    public List<string>? Options { get; set; } // for radio/checkbox
}
