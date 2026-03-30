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

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ProviderAppointmentType>()
            .HasKey(x => new { x.ProviderId, x.AppointmentTypeId });

        builder.Entity<Practice>()
            .HasIndex(p => p.Slug)
            .IsUnique();

        builder.Entity<Appointment>()
            .HasIndex(a => a.CancellationToken)
            .IsUnique();

        builder.Entity<AppUser>()
            .HasOne(u => u.Practice)
            .WithMany(p => p.Users)
            .HasForeignKey(u => u.PracticeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
