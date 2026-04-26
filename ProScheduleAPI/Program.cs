using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;
using ProScheduleAPI.Services;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Identity
builder.Services.AddIdentityCore<AppUser>(opts =>
{
    opts.Password.RequireDigit = true;
    opts.Password.RequiredLength = 8;
    opts.Password.RequireNonAlphanumeric = false;
    opts.Password.RequireUppercase = false;
})
.AddRoles<IdentityRole<int>>()
.AddEntityFrameworkStores<AppDbContext>();

// JWT
var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true
        };
    });

// Authorization policies. Roles are stamped into JWTs by TokenService as
// ClaimTypes.Role from the UserRole enum's string name. RequireRole accepts
// any of the listed names — first match wins.
//
//   SuperAdmin    — platform operator only.
//   PracticeAdmin — accepts Admin within a tenant OR SuperAdmin (since
//                   SuperAdmins operate above tenants and naturally cover
//                   everything an Admin can do).
//   ManageGlobals — restricted to SuperAdmin. Used to gate global form
//                   template / group management endpoints (Phase 3).
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SuperAdmin",     p => p.RequireRole("SuperAdmin"));
    options.AddPolicy("PracticeAdmin",  p => p.RequireRole("SuperAdmin", "Admin"));
    options.AddPolicy("ManageGlobals",  p => p.RequireRole("SuperAdmin"));
});

// Services
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AvailabilityService>();

// Email provider selection — driven by the "Email:Provider" config key so
// deployments can swap SMTP / SendGrid / disabled without a code change.
// When no provider is explicitly set we auto-detect from whichever
// credentials are populated, checking BOTH the new "Email:SendGrid:ApiKey"
// path and the legacy top-level "SendGrid:ApiKey" so existing configs still
// work. Falls back to the null-logger sender so devs without any
// credentials can still run the app and see what WOULD have been sent.
var emailProvider = (builder.Configuration["Email:Provider"] ?? "").Trim().ToLowerInvariant();
if (string.IsNullOrEmpty(emailProvider))
{
    var hasSendGridKey =
        !string.IsNullOrEmpty(builder.Configuration["Email:SendGrid:ApiKey"]) ||
        !string.IsNullOrEmpty(builder.Configuration["SendGrid:ApiKey"]);
    var hasSmtpHost = !string.IsNullOrEmpty(builder.Configuration["Email:Smtp:Host"]);

    if (hasSendGridKey)      emailProvider = "sendgrid";
    else if (hasSmtpHost)    emailProvider = "smtp";
    else                     emailProvider = "none";
}
switch (emailProvider)
{
    case "smtp":
        builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
        break;
    case "sendgrid":
        builder.Services.AddScoped<IEmailSender, SendGridEmailSender>();
        break;
    default:
        builder.Services.AddScoped<IEmailSender, NullEmailSender>();
        // Surface this prominently at startup. It's the single most common
        // reason "emails aren't sending" reports come in — the app silently
        // ran on NullEmailSender because no credentials were configured.
        Console.WriteLine(
            "[Email] WARNING: no provider configured (Email:Provider is empty " +
            "and no SMTP host / SendGrid API key found). Outbound email is " +
            "DISABLED — set Email:Provider to 'smtp' or 'sendgrid' and " +
            "populate the matching credentials to enable sending.");
        break;
}
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<SmsService>();
builder.Services.AddHostedService<ReminderHostedService>();

// Audit log (Phase 2). Scoped so it shares the request's DbContext and
// HttpContext. AddHttpContextAccessor() is required so AuditService can
// read the current user / IP in places that don't already inject the
// HttpContext directly. Cheap and safe to register globally.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IAuditService, AuditService>();

// CORS — origins come from two sources, unioned in PracticeCorsOriginProvider:
//   1. Static list in appsettings ("Cors:AllowedOrigins") for the ProSchedule
//      UI itself plus any dev hosts.
//   2. Practice.Website values in the database, so every registered practice
//      that sets their public site URL can iframe-embed /widget/* without a
//      server redeploy.
// The provider caches the DB lookup for a short TTL; controllers invalidate it
// on practice create/update.
builder.Services.AddSingleton<PracticeCorsOriginProvider>();

builder.Services.AddCors(opts =>
{
    // The CORS policy delegate runs per-request, so we need a stable handle to
    // the singleton provider. We can't call BuildServiceProvider() here — that
    // would create a second root every request. Instead, bind the delegate
    // lazily to the real provider once the host is built (see below).
    opts.AddPolicy("Angular", policy =>
        policy
            .SetIsOriginAllowed(origin =>
                PracticeCorsOriginProviderAccessor.Current?.IsAllowed(origin) ?? false)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "ProSchedule API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Enter JWT token",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        BearerFormat = "JWT",
        Scheme = "bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            []
        }
    });
});

var app = builder.Build();

// Bind the CORS origin provider accessor now that the root ServiceProvider
// exists. The SetIsOriginAllowed delegate above reads this static reference
// on every preflight — resolving the singleton exactly once keeps the DB cache
// shared across requests and avoids BuildServiceProvider() leaks.
PracticeCorsOriginProviderAccessor.Current =
    app.Services.GetRequiredService<PracticeCorsOriginProvider>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Auto-migrate on startup in development
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

// CLI commands — short-circuit before app.Run() if invoked. This keeps
// "operational" entry points colocated with the web host so they share
// configuration, DbContext registration, Identity setup, etc., without
// needing a separate console project.
//
//   dotnet run -- seed-superadmin --email <e> --password <p>
//
// On success the process exits 0; on failure, 1.
if (args.Length > 0 && args[0] == "seed-superadmin")
{
    var ok = await ProScheduleAPI.Services.SuperAdminSeeder.RunAsync(app, args.Skip(1).ToArray());
    return ok ? 0 : 1;
}

// Seed the standard global field groups (Contact Info, Address, Insurance,
// Medical Background, Medical History — Chiropractic, Medical History —
// Massage Therapy, Consents & Signature). Idempotent — safe to re-run.
if (args.Length > 0 && args[0] == "seed-form-groups")
{
    var ok = await ProScheduleAPI.Services.FormGroupSeeder.RunAsync(app);
    return ok ? 0 : 1;
}

app.UseCors("Angular");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

// `app.Run()` only returns when the host shuts down; this final return is
// here so the top-level statements all match the Task<int> return shape
// imposed by the seed-superadmin early-return above. The compiler can't
// see that Run() is "blocking forever" at type-check time.
return 0;
