using Microsoft.AspNetCore.Identity;

namespace ProScheduleAPI.Models;

public class AppUser : IdentityUser<int>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;

    /// <summary>
    /// The practice this user administers. NULL for client-only accounts
    /// (people who only book appointments and don't own a practice).
    /// </summary>
    public int? PracticeId { get; set; }
    public Practice? Practice { get; set; }

    public UserRole Role { get; set; } = UserRole.FrontDesk;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum UserRole
{
    Admin = 0,
    FrontDesk = 1,
    /// <summary>A consumer who books appointments across one or more practices.</summary>
    Client = 2
}
