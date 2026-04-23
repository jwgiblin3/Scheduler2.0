using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Data;

public class AppDbContext : IdentityDbContext<AppUser, IdentityRole<int>, int>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Practice> Practices => Set<Practice>();
    public DbSet<Provider> Providers => Set<Provider>();
    public DbSet<ProviderAvailability> ProviderAvailabilities => Set<ProviderAvailability>();
    public DbSet<AppointmentType> AppointmentTypes => Set<AppointmentType>();
    public DbSet<ProviderAppointmentType> ProviderAppointmentTypes => Set<ProviderAppointmentType>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<IntakeForm> IntakeForms => Set<IntakeForm>();
    public DbSet<IntakeFormResponse> IntakeFormResponses => Set<IntakeFormResponse>();
    public DbSet<NotificationSettings> NotificationSettings => Set<NotificationSettings>();
    public DbSet<PracticeHoliday> PracticeHolidays => Set<PracticeHoliday>();
    public DbSet<ProviderException> ProviderExceptions => Set<ProviderException>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ProviderAppointmentType>()
            .HasKey(x => new { x.ProviderId, x.AppointmentTypeId });

        builder.Entity<ProviderAppointmentType>()
            .HasOne(x => x.Provider)
            .WithMany(p => p.ProviderAppointmentTypes)
            .HasForeignKey(x => x.ProviderId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<ProviderAppointmentType>()
            .HasOne(x => x.AppointmentType)
            .WithMany(at => at.ProviderAppointmentTypes)
            .HasForeignKey(x => x.AppointmentTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Practice>()
            .HasIndex(p => p.Slug)
            .IsUnique();

        builder.Entity<Appointment>()
            .HasIndex(a => a.CancellationToken)
            .IsUnique();

        // AppUser.PracticeId is nullable — client-only accounts don't belong to a practice.
        builder.Entity<AppUser>()
            .HasOne(u => u.Practice)
            .WithMany(p => p.Users)
            .HasForeignKey(u => u.PracticeId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // Link Client rows back to the AspNetUsers account that booked them (optional).
        // Used by GET /appointments/me to resolve "which appointments belong to this user".
        builder.Entity<Client>()
            .HasOne(c => c.AppUser)
            .WithMany()
            .HasForeignKey(c => c.AppUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Client>()
            .HasIndex(c => c.AppUserId);

        // SQL Server doesn't allow multiple cascade paths to the same table.
        // Appointments references Clients, Providers, and AppointmentTypes — all of which
        // trace back to Practice — so we restrict cascades here and handle deletes manually.
        builder.Entity<Appointment>()
            .HasOne(a => a.Client)
            .WithMany(c => c.Appointments)
            .HasForeignKey(a => a.ClientId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Appointment>()
            .HasOne(a => a.Provider)
            .WithMany(p => p.Appointments)
            .HasForeignKey(a => a.ProviderId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Appointment>()
            .HasOne(a => a.AppointmentType)
            .WithMany(at => at.Appointments)
            .HasForeignKey(a => a.AppointmentTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Practice holidays cascade with the practice — if a practice is deleted,
        // its holiday rows go with it. Index by practice + date range so the
        // "is date X blocked?" query is fast.
        builder.Entity<PracticeHoliday>()
            .HasOne(h => h.Practice)
            .WithMany(p => p.Holidays)
            .HasForeignKey(h => h.PracticeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<PracticeHoliday>()
            .HasIndex(h => new { h.PracticeId, h.StartDate, h.EndDate });

        // Provider exceptions cascade with the provider.
        builder.Entity<ProviderException>()
            .HasOne(e => e.Provider)
            .WithMany(p => p.Exceptions)
            .HasForeignKey(e => e.ProviderId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<ProviderException>()
            .HasIndex(e => new { e.ProviderId, e.StartDate, e.EndDate });
    }
}
