using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

public class TokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public string CreateToken(AppUser user)
    {
        var claims = new List<Claim>
        {
            // "userId" is the primary claim the app reads. "nameid"
            // (ClaimTypes.NameIdentifier) is kept too because ASP.NET Identity's
            // UserManager.GetUserAsync(ClaimsPrincipal) relies on it.
            new("userId", user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
            new(ClaimTypes.GivenName, user.FirstName),
            new(ClaimTypes.Surname, user.LastName),
            new("role", user.Role.ToString())
        };

        // Only practice admins/staff have a practiceId. Client-only accounts omit it.
        if (user.PracticeId is int pid)
            claims.Add(new Claim("practiceId", pid.ToString()));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha512Signature);

        var tokenDesc = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddDays(7),
            SigningCredentials = creds,
            Issuer = _config["Jwt:Issuer"],
            Audience = _config["Jwt:Audience"]
        };

        var handler = new JwtSecurityTokenHandler();
        var token = handler.CreateToken(tokenDesc);
        return handler.WriteToken(token);
    }
}
