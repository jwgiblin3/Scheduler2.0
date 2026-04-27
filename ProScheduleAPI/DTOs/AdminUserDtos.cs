namespace ProScheduleAPI.DTOs;

/// <summary>
/// SuperAdmin row in the admin-users list. No password material — that's
/// only ever sent on create.
/// </summary>
public record AdminUserDto(
    int Id,
    string Email,
    string FirstName,
    string LastName,
    DateTime CreatedAt,
    bool IsSelf
);

public record CreateAdminUserRequest(
    string Email,
    string FirstName,
    string LastName,
    string Password
);
