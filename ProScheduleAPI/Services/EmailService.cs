namespace ProScheduleAPI.Services;

/// <summary>
/// High-level "what to send" layer. Holds the HTML templates for every
/// notification the app emits and delegates actual delivery to an
/// IEmailSender (SMTP, SendGrid, or null-logger), chosen in Program.cs
/// by the "Email:Provider" config key.
///
/// From-address resolution order for each send:
///   1. Explicit fromEmail / fromName passed by the caller (per-practice override).
///   2. Email:FromEmail / Email:FromName (app-level default).
///   3. Legacy SendGrid:FromEmail / SendGrid:FromName (kept for backward compat).
///   4. Hard-coded "noreply@pryschedule.com" / "ProSchedule" fallback so we
///      never send from an empty MailFrom.
/// </summary>
public class EmailService
{
    private readonly IEmailSender _sender;
    private readonly IConfiguration _config;

    public EmailService(IEmailSender sender, IConfiguration config)
    {
        _sender = sender;
        _config = config;
    }

    public Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
        string? fromEmail = null, string? fromName = null)
    {
        var resolvedFromEmail = fromEmail
            ?? _config["Email:FromEmail"]
            ?? _config["SendGrid:FromEmail"]
            ?? "noreply@pryschedule.com";
        var resolvedFromName = fromName
            ?? _config["Email:FromName"]
            ?? _config["SendGrid:FromName"]
            ?? "ProSchedule";

        return _sender.SendAsync(toEmail, toName, subject, htmlBody,
            resolvedFromEmail, resolvedFromName);
    }

    // --- Notification templates ---

    public Task SendBookingConfirmationAsync(
        string clientEmail, string clientName,
        string providerName, string apptTypeName,
        DateTime startTime, string practiceSlug,
        string cancellationToken,
        string? practiceName = null,
        string? addressLine1 = null, string? city = null,
        string? state = null, string? postalCode = null,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"Appointment Confirmed – {apptTypeName}";
        var cancelUrl = $"/book/{practiceSlug}/cancel?token={cancellationToken}";
        var rescheduleUrl = $"/book/{practiceSlug}?reschedule={cancellationToken}";

        // Build the location block from whichever structured address fields the
        // practice has filled in. If nothing is set, we simply skip the section
        // rather than render empty lines or stray punctuation.
        var addressBlock = BuildAddressBlock(practiceName, addressLine1, city, state, postalCode);

        var html = $"""
            <h2>Your appointment is confirmed!</h2>
            <p>Hi {clientName},</p>
            <p>Your <strong>{apptTypeName}</strong> with <strong>{providerName}</strong> is scheduled for:</p>
            <p style="font-size:18px;font-weight:bold">{startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</p>
            {addressBlock}
            <br/>
            <p>
              <a href="{rescheduleUrl}" style="margin-right:16px">Reschedule</a>
              <a href="{cancelUrl}">Cancel appointment</a>
            </p>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;

        return SendAsync(clientEmail, clientName, subject, html, fromEmail, fromName);
    }

    // Composes the "Location" block for confirmation emails from the practice's
    // structured address fields. Returns an empty string when the practice has
    // no address set so the email doesn't show an empty heading.
    private static string BuildAddressBlock(
        string? practiceName, string? line1, string? city, string? state, string? postalCode)
    {
        var hasAny = !string.IsNullOrWhiteSpace(line1)
                  || !string.IsNullOrWhiteSpace(city)
                  || !string.IsNullOrWhiteSpace(state)
                  || !string.IsNullOrWhiteSpace(postalCode);
        if (!hasAny) return string.Empty;

        var cityState = string.Join(", ", new[]
        {
            (city ?? "").Trim(),
            string.Join(" ", new[] { (state ?? "").Trim(), (postalCode ?? "").Trim() }
                .Where(s => s.Length > 0))
        }.Where(s => s.Length > 0));

        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(practiceName)) lines.Add($"<strong>{practiceName}</strong>");
        if (!string.IsNullOrWhiteSpace(line1)) lines.Add(line1!.Trim());
        if (!string.IsNullOrWhiteSpace(cityState)) lines.Add(cityState);

        return $"""
            <p style="margin-top:12px">
              <span style="color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Location</span><br/>
              {string.Join("<br/>", lines)}
            </p>
            """;
    }

    public Task SendReminderAsync(
        string clientEmail, string clientName,
        string providerName, string apptTypeName,
        DateTime startTime, string practiceSlug,
        string cancellationToken, int hoursAway,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"Reminder: {apptTypeName} in {hoursAway} hours";
        var cancelUrl = $"/book/{practiceSlug}/cancel?token={cancellationToken}";

        var html = $"""
            <h2>Appointment Reminder</h2>
            <p>Hi {clientName},</p>
            <p>This is a reminder that your <strong>{apptTypeName}</strong> with <strong>{providerName}</strong> is in <strong>{hoursAway} hours</strong>:</p>
            <p style="font-size:18px;font-weight:bold">{startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</p>
            <br/>
            <p><a href="{cancelUrl}">Cancel appointment</a></p>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;

        return SendAsync(clientEmail, clientName, subject, html, fromEmail, fromName);
    }

    public Task SendCancellationToClientAsync(
        string clientEmail, string clientName,
        string apptTypeName, DateTime startTime,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"Appointment Cancelled – {apptTypeName}";
        var html = $"""
            <h2>Appointment Cancelled</h2>
            <p>Hi {clientName},</p>
            <p>Your <strong>{apptTypeName}</strong> on <strong>{startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</strong> has been cancelled.</p>
            <p>To rebook, visit our booking page.</p>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;
        return SendAsync(clientEmail, clientName, subject, html, fromEmail, fromName);
    }

    public Task SendNewBookingToProviderAsync(
        string providerEmail, string providerName,
        string clientName, string clientEmail,
        string apptTypeName, DateTime startTime,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"New Booking: {apptTypeName} – {clientName}";
        var html = $"""
            <h2>New Appointment Booked</h2>
            <p>Hi {providerName},</p>
            <p>A new appointment has been booked:</p>
            <ul>
              <li><strong>Client:</strong> {clientName} ({clientEmail})</li>
              <li><strong>Type:</strong> {apptTypeName}</li>
              <li><strong>When:</strong> {startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</li>
            </ul>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;
        return SendAsync(providerEmail, providerName, subject, html, fromEmail, fromName);
    }

    public Task SendCancellationToProviderAsync(
        string providerEmail, string providerName,
        string clientName, string apptTypeName, DateTime startTime,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"Appointment Cancelled: {apptTypeName} – {clientName}";
        var html = $"""
            <h2>Appointment Cancelled</h2>
            <p>Hi {providerName},</p>
            <p><strong>{clientName}</strong>'s <strong>{apptTypeName}</strong> on <strong>{startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</strong> has been cancelled.</p>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;
        return SendAsync(providerEmail, providerName, subject, html, fromEmail, fromName);
    }

    public Task SendIntakeSubmittedToProviderAsync(
        string providerEmail, string providerName,
        string clientName, string apptTypeName, DateTime startTime,
        string? fromEmail = null, string? fromName = null)
    {
        var subject = $"Intake Form Submitted – {clientName}";
        var html = $"""
            <h2>Intake Form Submitted</h2>
            <p>Hi {providerName},</p>
            <p><strong>{clientName}</strong> has submitted their intake form for their <strong>{apptTypeName}</strong> on <strong>{startTime:dddd, MMMM d, yyyy 'at' h:mm tt}</strong>.</p>
            <p>Log in to ProSchedule to view the responses.</p>
            <p style="color:#999;font-size:12px">Sent by ProSchedule</p>
            """;
        return SendAsync(providerEmail, providerName, subject, html, fromEmail, fromName);
    }
}
