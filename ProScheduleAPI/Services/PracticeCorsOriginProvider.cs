using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Controllers;
using ProScheduleAPI.Data;

namespace ProScheduleAPI.Services;

/// <summary>
/// Provides the set of origins that are allowed to call the API via CORS.
/// The allow-list is a union of:
///   1. The static origins configured in appsettings ("Cors:AllowedOrigins")
///      — these cover the ProSchedule UI itself, plus dev hosts.
///   2. The per-practice Website values stored in the Practices table. This
///      is how third-party practice sites get added to the allow-list after
///      an admin types their site URL into the settings page.
///
/// The set is cached in memory for a short TTL (default 60 seconds) to avoid
/// a database round-trip on every CORS preflight; the cache is also flushed
/// explicitly on practice register/update by calling <see cref="Invalidate"/>.
/// </summary>
public class PracticeCorsOriginProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly string[] _staticOrigins;
    private readonly TimeSpan _ttl;
    private readonly object _gate = new();

    private HashSet<string> _cache = new(StringComparer.OrdinalIgnoreCase);
    private DateTime _cacheExpiresAt = DateTime.MinValue;

    // Set by Invalidate(); checked on the next IsAllowed call. Static because
    // controllers call it without DI — CORS is infrastructure-level config and
    // we don't want to force every caller to inject the service.
    private static volatile bool _invalidated;

    public PracticeCorsOriginProvider(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _staticOrigins = configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();

        var ttlSeconds = configuration.GetValue<int?>("Cors:CacheTtlSeconds") ?? 60;
        _ttl = TimeSpan.FromSeconds(Math.Max(1, ttlSeconds));
    }

    /// <summary>
    /// Evicts the cached practice-website origins. Call this from the code
    /// paths that create or update a practice so the next request reloads.
    /// Static so controllers don't need to inject the provider.
    /// </summary>
    public static void Invalidate() => _invalidated = true;

    /// <summary>
    /// True when the supplied origin is in the static list or matches any
    /// stored practice Website (case-insensitive, exact origin match — scheme
    /// + host + port).
    /// </summary>
    public bool IsAllowed(string origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return false;

        EnsureCacheFresh();

        // Check static list first (cheap).
        foreach (var s in _staticOrigins)
        {
            if (string.Equals(s, origin, StringComparison.OrdinalIgnoreCase)) return true;
        }

        return _cache.Contains(origin);
    }

    private void EnsureCacheFresh()
    {
        var now = DateTime.UtcNow;
        if (!_invalidated && now < _cacheExpiresAt && _cache.Count >= 0 && _cacheExpiresAt != DateTime.MinValue)
            return;

        // Double-checked lock. Only one thread does the DB load at a time.
        lock (_gate)
        {
            if (!_invalidated && DateTime.UtcNow < _cacheExpiresAt) return;

            var fresh = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var stored = db.Practices
                    .AsNoTracking()
                    .Where(p => p.Website != null && p.Website != "")
                    .Select(p => p.Website!)
                    .ToList();

                foreach (var row in stored)
                {
                    foreach (var origin in WebsiteNormalizer.Split(row))
                    {
                        fresh.Add(origin);
                    }
                }
            }
            catch
            {
                // If the DB is unavailable, fall back to the previous cache
                // rather than opening CORS up. Swallow — CORS is non-critical
                // for the request itself to process.
            }

            _cache = fresh;
            _cacheExpiresAt = DateTime.UtcNow + _ttl;
            _invalidated = false;
        }
    }
}

/// <summary>
/// Holds a process-wide reference to the singleton <see cref="PracticeCorsOriginProvider"/>
/// after the host has been built. CORS policy delegates are configured before
/// the container is ready, so they capture this accessor instead of the
/// provider directly; Program.cs assigns <see cref="Current"/> right after
/// <c>builder.Build()</c>.
/// </summary>
public static class PracticeCorsOriginProviderAccessor
{
    public static PracticeCorsOriginProvider? Current { get; set; }
}
