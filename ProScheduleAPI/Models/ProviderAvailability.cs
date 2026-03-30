namespace ProScheduleAPI.Models;

public class ProviderAvailability
{
    public int Id { get; set; }
    public int ProviderId { get; set; }
    public Provider Provider { get; set; } = null!;
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public bool IsActive { get; set; } = true;
}
