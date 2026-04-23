namespace ProScheduleAPI.Models;

/// <summary>
/// A day (or range of days) when the entire practice is closed — public
/// holidays, retreats, weather closures, etc. Used by the availability
/// service to block bookings on those dates.
/// </summary>
public class PracticeHoliday
{
    public int Id { get; set; }
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;

    /// <summary>First day of the closure (inclusive).</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>
    /// Last day of the closure (inclusive). For a one-day holiday, this equals
    /// <see cref="StartDate"/>. Stored explicitly (rather than a duration) so
    /// queries can "any row covers this date" with a straightforward range check.
    /// </summary>
    public DateOnly EndDate { get; set; }

    /// <summary>Optional label ("Christmas", "Office retreat"). Never shown to clients.</summary>
    public string? Name { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
