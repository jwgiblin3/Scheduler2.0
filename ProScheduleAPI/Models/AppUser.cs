using Microsoft.AspNetCore.Identity;

namespace ProScheduleAPI.Models;

public class AppUser : IdentityUser<int>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public int PracticeId { get; set; }
    public Practice Practice { get; set; } = null!;
    public UserRole Role { get; set; } = UserRole.FrontDesk;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum UserRole
{
    Admin = 0,
    FrontDesk = 1
}
