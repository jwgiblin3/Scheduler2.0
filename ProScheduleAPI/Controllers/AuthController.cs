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

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        if (await _db.Practices.AnyAsync(p => p.Slug == req.PracticeSlug))
            return BadRequest("Practice slug is already taken.");

        if (await _userManager.FindByEmailAsync(req.Email) is not null)
            return BadRequest("Email already in use.");

        var practice = new Practice
        {
            Name = req.PracticeName,
            Slug = req.PracticeSlug.ToLowerInvariant(),
            AdminEmail = req.Email
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

        return Ok(new AuthResponse(
            _tokenService.CreateToken(user),
            user.Email,
            user.FirstName,
            user.LastName,
            user.Role.ToString(),
            practice.Id,
            practice.Name
        ));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var user = await _userManager.Users
            .Include(u => u.Practice)
            .FirstOrDefaultAsync(u => u.Email == req.Email);

        if (user is null || !await _userManager.CheckPasswordAsync(user, req.Password))
            return Unauthorized("Invalid credentials.");

        return Ok(new AuthResponse(
            _tokenService.CreateToken(user),
            user.Email!,
            user.FirstName,
            user.LastName,
            user.Role.ToString(),
            user.PracticeId,
            user.Practice.Name
        ));
    }
}
