namespace ProScheduleAPI.DTOs;

public record LoginRequest(string Email, string Password);

public record RegisterRequest(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string PracticeName,
    string PracticeSlug,
    // Optional public-facing practice website. When provided, the origin is
    // added to the dynamic CORS allow-list so the practice can embed the
    // /widget/* routes on their own site.
    string? PracticeWebsite
);

/// <summary>Registration for a client who only books appointments (no practice).</summary>
public record ClientRegisterRequest(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string? Phone
);

/// <summary>
/// Creates a new Practice for the currently signed-in user. Used when a client
/// account decides to "upgrade" and open their own practice — the account gets
/// promoted to Admin and linked to the new practice.
/// </summary>
public record CreatePracticeRequest(
    string PracticeName,
    string PracticeSlug,
    string? PracticeWebsite
);

public record AuthResponse(
    string Token,
    string Email,
    string FirstName,
    string LastName,
    string Role,
    // Practice fields are nullable — clients don't own a practice.
    int? PracticeId,
    string? PracticeName,
    string? PracticeSlug,
    bool HasClientAppointments,
    string? Phone
);
