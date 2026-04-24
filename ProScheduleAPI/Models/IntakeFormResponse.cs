namespace ProScheduleAPI.Models;

/// <summary>
/// A single filled-in form submitted by a client for a specific appointment.
/// Named "IntakeFormResponse" for historical reasons, but now covers any form
/// in the PracticeForm library — waivers, intakes, new-customer questionnaires,
/// etc. One appointment can have multiple responses (one per attached form).
/// </summary>
public class IntakeFormResponse
{
    public int Id { get; set; }
    public int AppointmentId { get; set; }
    public Appointment Appointment { get; set; } = null!;

    /// <summary>
    /// The form this response was submitted against. Nullable for legacy rows
    /// written before the Forms library existed (those rows are tied to the
    /// single form that used to live on the AppointmentType).
    /// </summary>
    public int? PracticeFormId { get; set; }
    public PracticeForm? PracticeForm { get; set; }

    public string ResponsesJson { get; set; } = "{}"; // JSON dict of fieldId -> answer
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
}
