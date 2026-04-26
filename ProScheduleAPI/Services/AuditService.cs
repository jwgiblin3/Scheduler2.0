using System.Security.Claims;
using System.Text.Json;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

/// <summary>
/// Records access events into <see cref="AuditLog"/> per ADR-001 §10.7.
/// Tolerant of missing context — a FailedLogin happens before the user is
/// identified, so the User/Role/Practice fields are nullable in those
/// cases. Never throws on its own; logs and swallows DB exceptions
/// because an audit-write failure should never tank the request that
/// triggered it (we'd rather have a missing audit row than a 500 on a
/// successful login).
/// </summary>
public interface IAuditService
{
    /// <summary>
    /// Write a single audit event. User and IP are pulled from the current
    /// HttpContext when available; pass <paramref name="explicitUserId"/>
    /// only for pre-auth events (failed logins) where there's no
    /// authenticated principal yet.
    /// </summary>
    Task LogAsync(
        AuditAction action,
        string entityType,
        string entityId,
        int? practiceId = null,
        IEnumerable<string>? changedFields = null,
        string? note = null,
        int? explicitUserId = null,
        string? explicitRole = null,
        CancellationToken ct = default);
}

public class AuditService : IAuditService
{
    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<AuditService> _logger;

    public AuditService(
        AppDbContext db,
        IHttpContextAccessor http,
        ILogger<AuditService> logger)
    {
        _db = db;
        _http = http;
        _logger = logger;
    }

    public async Task LogAsync(
        AuditAction action,
        string entityType,
        string entityId,
        int? practiceId = null,
        IEnumerable<string>? changedFields = null,
        string? note = null,
        int? explicitUserId = null,
        string? explicitRole = null,
        CancellationToken ct = default)
    {
        try
        {
            var ctx = _http.HttpContext;
            var user = ctx?.User;

            // Resolve userId: explicit override wins, otherwise pull from
            // the JWT's "userId" claim (which TokenService stamps).
            int? userId = explicitUserId;
            if (userId is null && user is not null)
            {
                var raw = user.FindFirstValue("userId") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (int.TryParse(raw, out var parsed)) userId = parsed;
            }

            var role = explicitRole
                ?? user?.FindFirstValue(ClaimTypes.Role)
                ?? user?.FindFirstValue("role");

            var ip = ctx?.Connection.RemoteIpAddress?.ToString();

            // Cap IP length defensively; some proxies prepend long headers
            // we may include later.
            if (ip is not null && ip.Length > 64) ip = ip.Substring(0, 64);

            var entry = new AuditLog
            {
                Timestamp = DateTime.UtcNow,
                UserId = userId,
                Role = role,
                IpAddress = ip,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                PracticeId = practiceId,
                ChangedFieldsJson = changedFields is null
                    ? null
                    : JsonSerializer.Serialize(changedFields),
                Note = note
            };

            _db.AuditLogs.Add(entry);
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Never propagate. A missing audit row is bad; a 500 caused by
            // audit-write failure is worse (potentially blocks login). We
            // log loudly so the gap is visible in app logs.
            _logger.LogError(ex,
                "AuditService.LogAsync failed for {Action} {EntityType}/{EntityId}. " +
                "Audit row was NOT written. This must not happen routinely.",
                action, entityType, entityId);
        }
    }
}
