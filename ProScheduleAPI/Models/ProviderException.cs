namespace ProScheduleAPI.Models;

/// <summary>
/// A date range when a provider is unavailable (vacation, sick leave, CE,
/// personal day). Layered *on top of* the provider's recurring weekly
/// availability — if an exception covers a given day, no slots are generated
/// regardless of what ProviderAvailability says.
/// </summary>
public class ProviderException
{
    public int Id { get; set; }
    public int ProviderId { get; set; }
    public Provider Provider { get; set; } = null!;

    /// <summary>First day the provider is out (inclusive).</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>
    /// Last day the provider is out (inclusive). For a single-day block this
    /// equals <see cref="StartDate"/>.
    /// </summary>
    public DateOnly EndDate { get; set; }

    /// <summary>Optional private note for the admin ("Paris trip", "Sick").</summary>
    public string? Reason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
