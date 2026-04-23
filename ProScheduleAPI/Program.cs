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

builder.Services.AddAuthorization();

// Services
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<SmsService>();
builder.Services.AddHostedService<ReminderHostedService>();

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

app.UseCors("Angular");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
