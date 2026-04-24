namespace ProScheduleAPI.Models;

/// <summary>
/// Join entity linking an AppointmentType to a PracticeForm. Enables a single
/// form (e.g. "Waiver") to be attached to multiple appointment types, and a
/// single appointment type to require multiple forms.
/// </summary>
public class AppointmentTypeForm
{
    public int AppointmentTypeId { get; set; }
    public AppointmentType AppointmentType { get; set; } = null!;

    public int PracticeFormId { get; set; }
    public PracticeForm PracticeForm { get; set; } = null!;

    /// <summary>
    /// Display order — lower values render first in the client intake flow.
    /// Defaults to 0 so forms without an explicit order fall in insertion order.
    /// </summary>
    public int SortOrder { get; set; } = 0;
}
