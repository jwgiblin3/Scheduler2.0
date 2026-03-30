namespace ProScheduleAPI.Models;

public class ProviderAppointmentType
{
    public int ProviderId { get; set; }
    public Provider Provider { get; set; } = null!;
    public int AppointmentTypeId { get; set; }
    public AppointmentType AppointmentType { get; set; } = null!;
}
