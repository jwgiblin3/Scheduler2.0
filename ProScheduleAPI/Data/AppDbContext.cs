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
    public DbSet<PracticeForm> PracticeForms => Set<PracticeForm>();
    public DbSet<AppointmentTypeForm> AppointmentTypeForms => Set<AppointmentTypeForm>();
    public DbSet<IntakeFormResponse> IntakeFormResponses => Set<IntakeFormResponse>();
    public DbSet<NotificationSettings> NotificationSettings => Set<NotificationSettings>();
    public DbSet<PracticeHoliday> PracticeHolidays => Set<PracticeHoliday>();
    public DbSet<ProviderException> ProviderExceptions => Set<ProviderException>();
    public DbSet<AvailabilityAlert> AvailabilityAlerts => Set<AvailabilityAlert>();

    // --- Phase 2: form-group / template / instance system + audit log ---
    // (See ADR-001 §4 for the data model and §10.7 for the audit policy.)
    public DbSet<FieldGroup> FieldGroups => Set<FieldGroup>();
    public DbSet<FieldGroupVersion> FieldGroupVersions => Set<FieldGroupVersion>();
    public DbSet<FormTemplate> FormTemplates => Set<FormTemplate>();
    public DbSet<FormTemplateVersion> FormTemplateVersions => Set<FormTemplateVersion>();
    public DbSet<FormInstance> FormInstances => Set<FormInstance>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

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

        // SuperAdmin invariant: a SuperAdmin (Role = -1) must have a NULL
        // PracticeId. Mirrored in AppUser.Validate() so the API returns a
        // friendly 400 before the DB ever rejects the row, but enforced here
        // too so direct SQL inserts can't bypass it.
        builder.Entity<AppUser>()
            .ToTable(t => t.HasCheckConstraint(
                "CK_AspNetUsers_SuperAdmin_NoPracticeId",
                "([Role] <> -1) OR ([PracticeId] IS NULL)"));

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

        // --- Forms library ---
        //
        // PracticeForms belong to a practice and cascade on delete.
        builder.Entity<PracticeForm>()
            .HasOne(f => f.Practice)
            .WithMany(p => p.Forms)
            .HasForeignKey(f => f.PracticeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<PracticeForm>()
            .HasIndex(f => f.PracticeId);

        // Join table: composite PK, and both sides cascade so removing either
        // end cleanly tears down the attachment row.
        builder.Entity<AppointmentTypeForm>()
            .HasKey(x => new { x.AppointmentTypeId, x.PracticeFormId });

        builder.Entity<AppointmentTypeForm>()
            .HasOne(x => x.AppointmentType)
            .WithMany(at => at.AppointmentTypeForms)
            .HasForeignKey(x => x.AppointmentTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        // PracticeForm ↔ AppointmentType both chain back to Practice, which
        // would produce a multi-cascade path. Restrict here and rely on the
        // AppointmentType cascade (or manual cleanup) when a form is deleted.
        builder.Entity<AppointmentTypeForm>()
            .HasOne(x => x.PracticeForm)
            .WithMany(f => f.AppointmentTypeForms)
            .HasForeignKey(x => x.PracticeFormId)
            .OnDelete(DeleteBehavior.Restrict);

        // Response now optionally references the form it was submitted for.
        // An appointment can have many responses — one per completed form.
        builder.Entity<IntakeFormResponse>()
            .HasOne(r => r.Appointment)
            .WithMany(a => a.IntakeFormResponses)
            .HasForeignKey(r => r.AppointmentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<IntakeFormResponse>()
            .HasOne(r => r.PracticeForm)
            .WithMany()
            .HasForeignKey(r => r.PracticeFormId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);

        builder.Entity<IntakeFormResponse>()
            .HasIndex(r => new { r.AppointmentId, r.PracticeFormId });

        // --- Availability alerts (a.k.a. waitlist entries) ---
        // Cascade from Practice so test-practice cleanup doesn't leave orphans.
        // Indexed by (PracticeId, IsActive) because the notification job
        // will repeatedly ask "which active alerts exist for this practice?".
        builder.Entity<AvailabilityAlert>()
            .HasOne(a => a.Practice)
            .WithMany()
            .HasForeignKey(a => a.PracticeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<AvailabilityAlert>()
            .HasIndex(a => new { a.PracticeId, a.IsActive });

        // --- Phase 2: Field groups, form templates, form instances ---
        // See ADR-001 §4 for the data-model rationale.

        // FieldGroup: LogicalId is the stable identity referenced by both
        // version rows and template references. We make it the alternate
        // key (so FK relationships can target it) but keep an int Id-style
        // arrangement is unnecessary — LogicalId IS the PK here, since
        // FieldGroup is the "logical" row, not a versioned snapshot.
        builder.Entity<FieldGroup>()
            .HasKey(g => g.LogicalId);

        builder.Entity<FieldGroup>()
            .HasOne(g => g.OwnerPractice)
            .WithMany()
            .HasForeignKey(g => g.OwnerPracticeId)
            .IsRequired(false)
            // Restrict so deleting a practice that has overrides doesn't
            // silently nuke the override rows — admins resolve manually.
            .OnDelete(DeleteBehavior.Restrict);

        // Common admin-UI query: list groups visible to a practice (its own
        // overrides + globals) filtered by category and not soft-deleted.
        builder.Entity<FieldGroup>()
            .HasIndex(g => new { g.OwnerPracticeId, g.Category, g.IsGlobal });

        builder.Entity<FieldGroup>()
            .HasIndex(g => g.ParentLogicalId);   // "is there a fork of this global?"

        // FieldGroupVersion: int Id PK + FK to FieldGroup.LogicalId.
        // (LogicalId, Version) is unique — that's the addressable handle
        // a template reference points at.
        builder.Entity<FieldGroupVersion>()
            .HasOne(v => v.FieldGroup)
            .WithMany(g => g.Versions)
            .HasForeignKey(v => v.FieldGroupLogicalId)
            .HasPrincipalKey(g => g.LogicalId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FieldGroupVersion>()
            .HasIndex(v => new { v.FieldGroupLogicalId, v.Version })
            .IsUnique();

        builder.Entity<FieldGroupVersion>()
            .HasOne(v => v.CreatedByUser)
            .WithMany()
            .HasForeignKey(v => v.CreatedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // FormTemplate — same shape as FieldGroup.
        builder.Entity<FormTemplate>()
            .HasKey(t => t.LogicalId);

        builder.Entity<FormTemplate>()
            .HasOne(t => t.OwnerPractice)
            .WithMany()
            .HasForeignKey(t => t.OwnerPracticeId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<FormTemplate>()
            .HasIndex(t => new { t.OwnerPracticeId, t.TargetAudience, t.IsGlobal });

        builder.Entity<FormTemplate>()
            .HasIndex(t => t.ParentLogicalId);

        // FormTemplateVersion — same shape as FieldGroupVersion.
        builder.Entity<FormTemplateVersion>()
            .HasOne(v => v.FormTemplate)
            .WithMany(t => t.Versions)
            .HasForeignKey(v => v.FormTemplateLogicalId)
            .HasPrincipalKey(t => t.LogicalId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FormTemplateVersion>()
            .HasIndex(v => new { v.FormTemplateLogicalId, v.Version })
            .IsUnique();

        builder.Entity<FormTemplateVersion>()
            .HasOne(v => v.CreatedByUser)
            .WithMany()
            .HasForeignKey(v => v.CreatedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // FormInstance — pinned to a template version, references an
        // appointment. Restrict on Appointment delete: clinical/audit
        // record, deleting silently with the appointment would lose
        // history. Cascade on FormTemplateVersion.Restrict too — a version
        // shouldn't be deletable if any instance refers to it.
        builder.Entity<FormInstance>()
            .HasOne(i => i.Appointment)
            .WithMany()
            .HasForeignKey(i => i.AppointmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<FormInstance>()
            .HasOne(i => i.FormTemplateVersion)
            .WithMany()
            .HasForeignKey(i => i.FormTemplateVersionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<FormInstance>()
            .HasIndex(i => i.AppointmentId);

        builder.Entity<FormInstance>()
            .HasIndex(i => new { i.Status, i.SubmittedAt });

        // --- Audit log ---
        // bigint PK because this table grows unbounded and 2B rows is
        // reachable over years; nothing else uses bigint so we explicitly
        // type it. Indexes target the three primary query shapes:
        //   1. "what did this user do?"      (UserId + Timestamp)
        //   2. "what happened in this tenant?" (PracticeId + Timestamp)
        //   3. "who touched this entity?"     (EntityType + EntityId + Timestamp)
        // ADR-001 §10.7 and PARKING-LOT.md #15 cover the append-only and
        // streaming-to-external-store stories.
        builder.Entity<AuditLog>()
            .HasOne(a => a.User)
            .WithMany()
            .HasForeignKey(a => a.UserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AuditLog>()
            .HasIndex(a => new { a.UserId, a.Timestamp });

        builder.Entity<AuditLog>()
            .HasIndex(a => new { a.PracticeId, a.Timestamp });

        builder.Entity<AuditLog>()
            .HasIndex(a => new { a.EntityType, a.EntityId, a.Timestamp });
    }
}
