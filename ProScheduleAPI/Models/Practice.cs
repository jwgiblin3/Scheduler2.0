using System.ComponentModel.DataAnnotations;

namespace ProScheduleAPI.Models;

public class Practice
{
    public int Id { get; set; }

    // Field-length caps per ADR-001 §6. Slug is conservative-tight (80) since
    // it appears in URLs; Website is 500 to fit a list of newline-separated
    // origins; URL fields are 500 to accommodate longer signed/CDN URLs.
    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(80)]
    public string Slug { get; set; } = string.Empty; // public booking URL segment

    [Required, EmailAddress, MaxLength(254)]
    public string AdminEmail { get; set; } = string.Empty;

    [Phone, MaxLength(20)]
    public string? Phone { get; set; }

    /// <summary>
    /// Legacy single-line address. Kept nullable so existing rows aren't lost,
    /// but the split AddressLine1 / City / State / PostalCode fields below are
    /// the canonical way to store address data going forward.
    /// </summary>
    [MaxLength(200)]
    public string? Address { get; set; }

    // Structured address — used on the public booking page and in emails.
    [MaxLength(100)]
    public string? AddressLine1 { get; set; }

    [MaxLength(60)]
    public string? City { get; set; }

    [MaxLength(50)]
    public string? State { get; set; }

    [MaxLength(20)]
    public string? PostalCode { get; set; }

    /// <summary>
    /// Public-facing website for the practice (e.g. "https://ridgewoodspine.com").
    /// When set, this origin is added to the dynamic CORS allow-list so the
    /// practice can iframe-embed /widget/* on their own site. Multiple origins
    /// can be stored as a newline- or semicolon-separated list.
    /// </summary>
    [MaxLength(500)]
    public string? Website { get; set; }

    /// <summary>
    /// Absolute URL to the practice logo image. Rendered on the public booking
    /// page and inside embeddable widgets so each practice keeps its branding.
    /// </summary>
    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    /// <summary>
    /// Hex color (e.g. "#0F766E") used as the banner / primary accent on the
    /// public booking page and widgets. Stored as the raw user input; the UI
    /// is responsible for validation and defaulting.
    /// </summary>
    [MaxLength(20)]
    public string? BannerColor { get; set; }

    [MaxLength(60)]
    public string? TimeZone { get; set; } = "America/New_York";
    public int CancellationWindowHours { get; set; } = 24;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Provider> Providers { get; set; } = [];
    public ICollection<AppointmentType> AppointmentTypes { get; set; } = [];
    public ICollection<Client> Clients { get; set; } = [];
    public ICollection<AppUser> Users { get; set; } = [];
    public ICollection<PracticeHoliday> Holidays { get; set; } = [];
    public ICollection<PracticeForm> Forms { get; set; } = [];
    public NotificationSettings? NotificationSettings { get; set; }
}
