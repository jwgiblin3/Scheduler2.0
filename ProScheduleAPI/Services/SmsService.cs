using Twilio;
using Twilio.Rest.Api.V2010.Account;

namespace ProScheduleAPI.Services;

public class SmsService
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmsService> _logger;

    public SmsService(IConfiguration config, ILogger<SmsService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string toPhone, string message)
    {
        var accountSid = _config["Twilio:AccountSid"];
        var authToken = _config["Twilio:AuthToken"];
        var fromPhone = _config["Twilio:FromPhone"];

        if (string.IsNullOrEmpty(accountSid) || string.IsNullOrEmpty(authToken))
        {
            _logger.LogWarning("Twilio not configured. SMS not sent to {Phone}", toPhone);
            return;
        }

        TwilioClient.Init(accountSid, authToken);

        try
        {
            await MessageResource.CreateAsync(
                body: message,
                from: new Twilio.Types.PhoneNumber(fromPhone),
                to: new Twilio.Types.PhoneNumber(toPhone)
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Twilio error sending SMS to {Phone}", toPhone);
        }
    }

    public Task SendBookingConfirmationAsync(string phone, string clientName, string apptTypeName, DateTime startTime)
        => SendAsync(phone, $"Hi {clientName}! Your {apptTypeName} is confirmed for {startTime:ddd MMM d 'at' h:mm tt}. Reply STOP to opt out.");

    public Task SendReminderAsync(string phone, string clientName, string apptTypeName, DateTime startTime, int hoursAway)
        => SendAsync(phone, $"Reminder {clientName}: your {apptTypeName} is in {hoursAway} hrs on {startTime:ddd MMM d 'at' h:mm tt}. Reply STOP to opt out.");

    public Task SendCancellationAsync(string phone, string clientName, string apptTypeName)
        => SendAsync(phone, $"Hi {clientName}, your {apptTypeName} has been cancelled. Visit our site to rebook. Reply STOP to opt out.");
}
