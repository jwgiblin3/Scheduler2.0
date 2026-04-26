using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

/// <summary>
/// One-shot CLI command that creates the very first SuperAdmin account.
/// Invoked from <c>Program.cs</c> when the process is started with
/// <c>seed-superadmin</c> as the first argument.
///
/// Usage:
/// <code>
///   dotnet run -- seed-superadmin --email you@example.com --password "S3cretPass!"
/// </code>
///
/// Refuses to run if any SuperAdmin already exists. This is intentional:
/// once the platform has a superadmin, additional ones must be created
/// through the admin UI (a future Phase 3 screen) so the action is logged
/// in the audit trail. The CLI exists only to bootstrap the first one,
/// before any admin UI is available to log into.
/// </summary>
public static class SuperAdminSeeder
{
    /// <summary>
    /// Returns true on success (caller should exit cleanly), false on
    /// any failure (caller should exit with non-zero code).
    /// </summary>
    public static async Task<bool> RunAsync(WebApplication app, string[] args)
    {
        var (email, password) = ParseArgs(args);
        if (email is null || password is null)
        {
            Console.Error.WriteLine(
                "Usage: dotnet run -- seed-superadmin --email <email> --password <password>");
            return false;
        }

        // Resolve services from a fresh scope so we don't leak DbContext
        // tracking across the operation.
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

        // Refuse to clobber an existing SuperAdmin. The intent is to
        // bootstrap the FIRST one only; subsequent ones go through the
        // admin UI so the action is audited.
        var existing = await db.Users.AnyAsync(u => u.Role == UserRole.SuperAdmin);
        if (existing)
        {
            Console.Error.WriteLine(
                "[seed-superadmin] A SuperAdmin already exists. Refusing to create another. " +
                "Use the admin UI to manage SuperAdmin accounts.");
            return false;
        }

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            Console.Error.WriteLine(
                $"[seed-superadmin] An account with email '{email}' already exists. " +
                "Pick a different email or promote that account through the admin UI.");
            return false;
        }

        var user = new AppUser
        {
            FirstName = "Super",
            LastName = "Admin",
            Email = email,
            UserName = email,
            EmailConfirmed = true,         // CLI-created — no signup confirmation flow
            PracticeId = null,             // invariant: SuperAdmin has no practice
            Role = UserRole.SuperAdmin
        };

        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            Console.Error.WriteLine("[seed-superadmin] Failed to create user:");
            foreach (var err in result.Errors)
                Console.Error.WriteLine($"  - {err.Code}: {err.Description}");
            return false;
        }

        Console.WriteLine(
            $"[seed-superadmin] Created SuperAdmin '{email}' (id={user.Id}). " +
            "Sign in via the admin UI to manage global form templates.");
        return true;
    }

    /// <summary>
    /// Tiny --flag parser. Tolerates either "--email x" or "--email=x".
    /// Order-independent. Returns nulls for any missing flag.
    /// </summary>
    private static (string? Email, string? Password) ParseArgs(string[] args)
    {
        string? email = null;
        string? password = null;

        for (int i = 0; i < args.Length; i++)
        {
            var arg = args[i];

            // Inline form: --flag=value
            if (arg.StartsWith("--email=", StringComparison.Ordinal))
                email = arg.Substring("--email=".Length);
            else if (arg.StartsWith("--password=", StringComparison.Ordinal))
                password = arg.Substring("--password=".Length);

            // Separated form: --flag value
            else if (arg == "--email" && i + 1 < args.Length)
                email = args[++i];
            else if (arg == "--password" && i + 1 < args.Length)
                password = args[++i];
        }

        return (email, password);
    }
}
