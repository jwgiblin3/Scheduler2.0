using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _db;
    private readonly TokenService _tokenService;

    public AuthController(UserManager<AppUser> userManager, AppDbContext db, TokenService tokenService)
    {
        _userManager = userManager;
        _db = db;
        _tokenService = tokenService;
    }

    // Practice-owner registration — creates a new Practice + admin account.
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.PracticeSlug))
            return BadRequest("Practice slug is required.");

        // Normalize once and use the same value for the uniqueness check
        // and the row we insert — otherwise "MyClinic" passes the check
        // but stores as "myclinic", and the second signup fails confusingly.
        var slug = req.PracticeSlug.Trim().ToLowerInvariant();

        if (await _db.Practices.AnyAsync(p => p.Slug == slug))
            return BadRequest("Practice slug is already taken.");

        if (await _userManager.FindByEmailAsync(req.Email) is not null)
            return BadRequest("Email already in use.");

        var practice = new Practice
        {
            Name = req.PracticeName,
            Slug = slug,
            AdminEmail = req.Email,
            Website = NormalizeWebsite(req.PracticeWebsite)
        };
        _db.Practices.Add(practice);
        await _db.SaveChangesAsync();

        var user = new AppUser
        {
            FirstName = req.FirstName,
            LastName = req.LastName,
            Email = req.Email,
            UserName = req.Email,
            PracticeId = practice.Id,
            Role = UserRole.Admin
        };

        var result = await _userManager.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        // A brand-new practice may have brought a new CORS-allowed origin with
        // it; nudge the dynamic origin cache so the next request refreshes.
        if (!string.IsNullOrEmpty(practice.Website))
            PracticeCorsOriginProvider.Invalidate();

        return Ok(await BuildAuthResponseAsync(user, practice));
    }

    // Client-only registration — no Practice, used by the public booking flow.
    [HttpPost("client-register")]
    public async Task<ActionResult<AuthResponse>> ClientRegister(ClientRegisterRequest req)
    {
        if (await _userManager.FindByEmailAsync(req.Email) is not null)
            return BadRequest("Email already in use.");

        var user = new AppUser
        {
            FirstName = req.FirstName,
            LastName = req.LastName,
            Email = req.Email,
            UserName = req.Email,
            PhoneNumber = req.Phone,
            PracticeId = null,
            Role = UserRole.Client
        };

        var result = await _userManager.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return BadRequest(result.Errors.Select(e => e.Description));

        return Ok(await BuildAuthResponseAsync(user, practice: null));
    }

    /// <summary>
    /// Adds a Practice to the signed-in account. The user must not already have one.
    /// On success the account is promoted to Admin and a new JWT (carrying the
    /// new practiceId claim) is issued — the client should replace the old token.
    /// </summary>
    [HttpPost("create-practice")]
    [Authorize]
    public async Task<ActionResult<AuthResponse>> CreatePractice(CreatePracticeRequest req)
    {
        // Resolve the signed-in user from the JWT. Accept either "userId" or the
        // standard NameIdentifier claim (older tokens only have the latter).
        var raw = User.FindFirstValue("userId") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(raw, out var userId))
            return Unauthorized();

        var user = await _userManager.Users
            .Include(u => u.Practice)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user is null) return Unauthorized();
        if (user.PracticeId.HasValue)
            return BadRequest("This account is already linked to a practice.");

        var slug = req.PracticeSlug.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(req.PracticeName))
            return BadRequest("Practice name is required.");
        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest("Practice slug is required.");
        if (await _db.Practices.AnyAsync(p => p.Slug == slug))
            return BadRequest("Practice slug is already taken.");

        var practice = new Practice
        {
            Name = req.PracticeName.Trim(),
            Slug = slug,
            AdminEmail = user.Email ?? string.Empty,
            Website = NormalizeWebsite(req.PracticeWebsite)
        };
        _db.Practices.Add(practice);
        await _db.SaveChangesAsync();

        user.PracticeId = practice.Id;
        user.Role = UserRole.Admin;
        await _userManager.UpdateAsync(user);

        // Reload with navigation so the response includes the new practice.
        await _db.Entry(user).Reference(u => u.Practice).LoadAsync();

        if (!string.IsNullOrEmpty(practice.Website))
            PracticeCorsOriginProvider.Invalidate();

        return Ok(await BuildAuthResponseAsync(user, practice));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var user = await _userManager.Users
            .Include(u => u.Practice)
            .FirstOrDefaultAsync(u => u.Email == req.Email);

        if (user is null || !await _userManager.CheckPasswordAsync(user, req.Password))
            return Unauthorized("Invalid credentials.");

        return Ok(await BuildAuthResponseAsync(user, user.Practice));
    }

    /// <summary>
    /// Builds the AuthResponse from a user (and optionally its practice). Also
    /// computes whether the user has any client-side appointments booked —
    /// used by the UI to decide between the "my practice" and "my appointments"
    /// landing pages when an admin is also a client.
    /// </summary>
    private async Task<AuthResponse> BuildAuthResponseAsync(AppUser user, Practice? practice)
    {
        // A user has "client appointments" if any Client row is linked to their
        // AspNetUsers id. We don't load the rows — we just need a bool.
        var hasClientAppts = await _db.Clients.AnyAsync(c => c.AppUserId == user.Id);

        return new AuthResponse(
            Token: _tokenService.CreateToken(user),
            Email: user.Email!,
            FirstName: user.FirstName,
            LastName: user.LastName,
            Role: user.Role.ToString(),
            PracticeId: practice?.Id,
            PracticeName: practice?.Name,
            PracticeSlug: practice?.Slug,
            HasClientAppointments: hasClientAppts,
            Phone: user.PhoneNumber
        );
    }

    /// <summary>
    /// Normalize practice website input into scheme+host+port origin strings
    /// (newline-separated). Returns null when the input is missing or cannot
    /// be parsed as an http(s) URL. Shared with SettingsController.
    /// </summary>
    private static string? NormalizeWebsite(string? input) =>
        WebsiteNormalizer.Normalize(input);
}

/// <summary>
/// Turns a user-supplied website value into a canonical list of CORS-ready
/// origins (newline separated). Shared between AuthController and
/// SettingsController so both entry points produce identical output.
/// </summary>
internal static class WebsiteNormalizer
{
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var origins = new List<string>();
        foreach (var rawEntry in input.Split(new[] { '\n', '\r', ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var entry = rawEntry;
            // Allow bare "example.com" — assume https://.
            if (!entry.Contains("://", StringComparison.Ordinal))
            {
                entry = "https://" + entry;
            }
            if (!Uri.TryCreate(entry, UriKind.Absolute, out var uri)) continue;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) continue;

            var origin = uri.IsDefaultPort
                ? $"{uri.Scheme}://{uri.Host}"
                : $"{uri.Scheme}://{uri.Host}:{uri.Port}";
            origin = origin.ToLowerInvariant();
            if (!origins.Contains(origin)) origins.Add(origin);
        }
        return origins.Count == 0 ? null : string.Join("\n", origins);
    }

    /// <summary>Splits a stored Website value back into individual origins.</summary>
    public static IEnumerable<string> Split(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored)) yield break;
        foreach (var piece in stored.Split(new[] { '\n', '\r', ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            yield return piece;
        }
    }
}
