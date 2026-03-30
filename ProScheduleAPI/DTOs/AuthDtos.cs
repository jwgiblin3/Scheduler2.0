namespace ProScheduleAPI.DTOs;

public record LoginRequest(string Email, string Password);

public record RegisterRequest(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string PracticeName,
    string PracticeSlug
);

public record AuthResponse(
    string Token,
    string Email,
    string FirstName,
    string LastName,
    string Role,
    int PracticeId,
    string PracticeName
);
