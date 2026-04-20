namespace ProScheduleAPI.Models;

public static class ProviderExtensions
{
    /// <summary>
    /// Returns the provider's display name, falling back to legacy First + Last
    /// for rows created before the DisplayName column existed.
    /// </summary>
    public static string GetDisplayName(this Provider p)
    {
        if (!string.IsNullOrWhiteSpace(p.DisplayName)) return p.DisplayName!;
        var legacy = $"{p.FirstName} {p.LastName}".Trim();
        return string.IsNullOrEmpty(legacy) ? "Provider" : legacy;
    }
}
