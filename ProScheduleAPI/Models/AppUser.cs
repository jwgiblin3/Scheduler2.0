using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace ProScheduleAPI.Models;

public class AppUser : IdentityUser<int>, IValidatableObject
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
    /// (people who only book appointments and don't own a practice) AND for
    /// platform SuperAdmins (who operate above any single tenant).
    /// </summary>
    public int? PracticeId { get; set; }
    public Practice? Practice { get; set; }

    public UserRole Role { get; set; } = UserRole.FrontDesk;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Application-level invariant: a SuperAdmin must NOT be linked to a
    /// practice. SuperAdmins operate cross-tenant; binding them to one
    /// practice would either silently scope their queries or quietly grant
    /// implicit admin on that practice — both bad. The DB enforces the same
    /// invariant via a CHECK constraint (see AppDbContext.OnModelCreating);
    /// this method gives a friendly server-side validation error before we
    /// ever attempt the SaveChanges that would trip the CHECK.
    /// </summary>
    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (Role == UserRole.SuperAdmin && PracticeId.HasValue)
        {
            yield return new ValidationResult(
                "SuperAdmin accounts must not be linked to a practice (PracticeId must be null).",
                new[] { nameof(PracticeId), nameof(Role) });
        }
    }
}

public enum UserRole
{
    /// <summary>
    /// Platform-level operator. Operates cross-tenant — manages global form
    /// templates, can inspect any practice. Must have <c>PracticeId == null</c>
    /// (enforced by both <see cref="AppUser.Validate"/> and a DB CHECK).
    /// Created only via the <c>seed-superadmin</c> CLI command.
    /// </summary>
    SuperAdmin = -1,

    Admin = 0,
    FrontDesk = 1,
    /// <summary>A consumer who books appointments across one or more practices.</summary>
    Client = 2
}
