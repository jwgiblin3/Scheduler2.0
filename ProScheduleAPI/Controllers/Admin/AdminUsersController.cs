using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.DTOs;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

namespace ProScheduleAPI.Controllers.Admin;

/// <summary>
/// SuperAdmin user-management. CRUD for AppUser rows with Role=SuperAdmin.
/// The very first SuperAdmin is bootstrapped via the <c>seed-superadmin</c>
/// CLI; this controller adds and removes additional ones through the UI
/// so the action is logged in the audit trail.
///
/// Safety guards:
///   - You cannot revoke yourself (avoids accidentally locking out the
///     only signed-in SuperAdmin during a session).
///   - You cannot revoke the last SuperAdmin (avoids leaving the platform
///     with no operator).
///
/// Promotion of an existing AppUser to SuperAdmin isn't exposed here —
/// only "create new SuperAdmin account" is. Promoting an existing user
/// crosses tenant boundaries (their Practice link would have to be
/// removed) and deserves explicit handling that we can add later if a
/// concrete need shows up.
/// </summary>
[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = "SuperAdmin")]
public class AdminUsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;
    private readonly IAuditService _audit;

    public AdminUsersController(
        AppDbContext db,
        UserManager<AppUser> userManager,
        IAuditService audit)
    {
        _db = db;
        _userManager = userManager;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<List<AdminUserDto>>> List()
    {
        var selfId = TryGetUserId();
        // Expression trees (what EF translates Select() into) don't support
        // named arguments — pass positional only. Last arg is IsSelf.
        var rows = await _db.Users
            .Where(u => u.Role == UserRole.SuperAdmin)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new AdminUserDto(
                u.Id, u.Email!, u.FirstName, u.LastName, u.CreatedAt,
                u.Id == (selfId ?? -1)))
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost]
    public async Task<ActionResult<AdminUserDto>> Create(CreateAdminUserRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email)) return BadRequest("Email is required.");
        if (string.IsNullOrWhiteSpace(req.Password)) return BadRequest("Password is required.");
        if (string.IsNullOrWhiteSpace(req.FirstName)) return BadRequest("First name is required.");
        if (string.IsNullOrWhiteSpace(req.LastName))  return BadRequest("Last name is required.");

        var email = req.Email.Trim();
        if (await _userManager.FindByEmailAsync(email) is not null)
            return BadRequest("An account with that email already exists.");

        var user = new AppUser
        {
            FirstName = req.FirstName.Trim(),
            LastName = req.LastName.Trim(),
            Email = email,
            UserName = email,
            EmailConfirmed = true,    // admin-created — no signup-confirmation flow
            PracticeId = null,        // SuperAdmin invariant
            Role = UserRole.SuperAdmin
        };
        var result = await _userManager.CreateAsync(user, req.Password);
        if (!result.Succeeded)
        {
            return BadRequest(string.Join("; ",
                result.Errors.Select(e => $"{e.Code}: {e.Description}")));
        }

        await _audit.LogAsync(
            AuditAction.Create,
            entityType: nameof(AppUser),
            entityId: user.Id.ToString(),
            note: $"Created SuperAdmin '{email}'");

        return CreatedAtAction(nameof(List), null,
            new AdminUserDto(user.Id, user.Email!, user.FirstName, user.LastName,
                user.CreatedAt, IsSelf: false));
    }

    /// <summary>
    /// Revoke an account's SuperAdmin role. Today the simplest semantic is
    /// "delete the account" — these accounts have no PracticeId so there's
    /// nothing to demote them TO that's meaningful (Client role with no
    /// practice is just... an inert account). Hard delete is acceptable
    /// here because every action is captured in the audit log; the audit
    /// row remains even after the User row is gone.
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Revoke(int id)
    {
        var selfId = TryGetUserId();
        if (selfId == id)
            return BadRequest("You cannot revoke your own SuperAdmin account.");

        var target = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (target is null) return NotFound();
        if (target.Role != UserRole.SuperAdmin)
            return BadRequest("Target is not a SuperAdmin.");

        // Refuse to leave the platform without any SuperAdmin.
        var remaining = await _db.Users.CountAsync(u =>
            u.Role == UserRole.SuperAdmin && u.Id != id);
        if (remaining == 0)
            return BadRequest("Cannot revoke the last SuperAdmin. Add another SuperAdmin first.");

        var capturedEmail = target.Email;
        await _userManager.DeleteAsync(target);

        await _audit.LogAsync(
            AuditAction.Delete,
            entityType: nameof(AppUser),
            entityId: id.ToString(),
            note: $"Revoked SuperAdmin '{capturedEmail}'");

        return NoContent();
    }

    private int? TryGetUserId()
    {
        var raw = User.FindFirstValue("userId") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : null;
    }
}
