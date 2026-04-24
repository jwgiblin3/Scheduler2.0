namespace ProScheduleAPI.Models;

/// <summary>
/// Form field definition shared by both the legacy IntakeForm layout and the
/// new PracticeForm library. The shape is serialized into FieldsJson on the
/// owning form row.
/// </summary>
public class IntakeFormField
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Label { get; set; } = string.Empty;
    public string Type { get; set; } = "text"; // text, textarea, radio, checkbox, date, signature
    public bool Required { get; set; } = false;
    public List<string>? Options { get; set; } // for radio/checkbox
}
