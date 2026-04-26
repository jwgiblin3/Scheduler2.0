using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace ProScheduleAPI.Models;

public class AppUser : IdentityUser<int>
{
    // Field-length caps per ADR-001 §6. Identity's own columns (Email,
    // UserName, NormalizedEmail, etc.) inherit IdentityUser defaults
    // (256). We only add limits on the fields we own.
    [Required, MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(80)]
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
