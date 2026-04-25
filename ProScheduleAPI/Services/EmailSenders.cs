using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using SendGrid;
using SendGrid.Helpers.Mail;

namespace ProScheduleAPI.Services;

/// <summary>
/// Low-level delivery interface. Implementations should handle connection
/// management and transient failures themselves; callers are expected to
/// catch nothing more than logged errors.
/// </summary>
public interface IEmailSender
{
    Task SendAsync(
        string toEmail, string toName,
        string subject, string htmlBody,
        string fromEmail, string fromName,
        CancellationToken ct = default);
}

/// <summary>
/// Sends via any SMTP server — localhost dev servers (smtp4dev, Papercut),
/// Gmail's relay, Mailtrap's staging inbox, an office Exchange server, etc.
/// Controlled entirely by config under "Email:Smtp".
/// </summary>
public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IConfiguration config, ILogger<SmtpEmailSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string toEmail, string toName,
        string subject, string htmlBody,
        string fromEmail, string fromName,
        CancellationToken ct = default)
    {
        var host = _config["Email:Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            _logger.LogWarning("SMTP host not configured. Email not sent to {Email}", toEmail);
            return;
        }
        var port = int.TryParse(_config["Email:Smtp:Port"], out var p) ? p : 25;
        var username = _config["Email:Smtp:Username"];
        var password = _config["Email:Smtp:Password"];
        // UseStartTls = true → port-587-style explicit STARTTLS upgrade (Gmail, Office 365).
        // When false we fall back to "Auto" which lets MailKit pick: plain for
        // localhost dev servers, implicit TLS for 465, STARTTLS elsewhere.
        var useStartTls = bool.TryParse(_config["Email:Smtp:UseStartTls"], out var tls) && tls;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, fromEmail));
        message.To.Add(new MailboxAddress(toName, toEmail));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

        using var client = new SmtpClient();
        try
        {
            var secureOption = useStartTls
                ? SecureSocketOptions.StartTls
                : SecureSocketOptions.Auto;
            await client.ConnectAsync(host, port, secureOption, ct);

            // Only authenticate when the server actually requires it —
            // smtp4dev / Papercut accept anonymous submission, Gmail demands auth.
            if (!string.IsNullOrEmpty(username))
                await client.AuthenticateAsync(username, password ?? "", ct);

            await client.SendAsync(message, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SMTP error sending email to {Email}", toEmail);
        }
        finally
        {
            if (client.IsConnected) await client.DisconnectAsync(true, ct);
        }
    }
}

/// <summary>
/// Sends via SendGrid's HTTP API. Kept for production where the SendGrid
/// free tier (100/day) plus their managed deliverability beats running
/// SMTP from anywhere other than a business-grade mail server.
/// </summary>
public class SendGridEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<SendGridEmailSender> _logger;

    public SendGridEmailSender(IConfiguration config, ILogger<SendGridEmailSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string toEmail, string toName,
        string subject, string htmlBody,
        string fromEmail, string fromName,
        CancellationToken ct = default)
    {
        // Prefer the new "Email:SendGrid:ApiKey" location; fall back to the
        // legacy top-level "SendGrid:ApiKey" so existing configs keep working.
        var apiKey = _config["Email:SendGrid:ApiKey"] ?? _config["SendGrid:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
        {
            _logger.LogWarning("SendGrid API key not configured. Email not sent to {Email}", toEmail);
            return;
        }

        var client = new SendGridClient(apiKey);
        var from = new EmailAddress(fromEmail, fromName);
        var to = new EmailAddress(toEmail, toName);
        var msg = MailHelper.CreateSingleEmail(from, to, subject, null, htmlBody);

        var response = await client.SendEmailAsync(msg, ct);
        if (!response.IsSuccessStatusCode)
            _logger.LogError("SendGrid error {Status} sending to {Email}", response.StatusCode, toEmail);
    }
}

/// <summary>
/// No-op sender used when no provider is configured. Logs what it would have
/// sent so local developers can still see the flow without setting up SMTP
/// or signing up for anything.
/// </summary>
public class NullEmailSender : IEmailSender
{
    private readonly ILogger<NullEmailSender> _logger;
    public NullEmailSender(ILogger<NullEmailSender> logger) => _logger = logger;

    public Task SendAsync(string toEmail, string toName,
        string subject, string htmlBody,
        string fromEmail, string fromName,
        CancellationToken ct = default)
    {
        _logger.LogInformation(
            "Email provider not configured — would have sent '{Subject}' from {FromEmail} to {ToEmail}.",
            subject, fromEmail, toEmail);
        return Task.CompletedTask;
    }
}
