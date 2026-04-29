using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProScheduleAPI.Data;
using ProScheduleAPI.Models;

namespace ProScheduleAPI.Services;

/// <summary>
/// One-shot CLI command that seeds the standard global field groups.
/// Idempotent: skips groups that already exist (matched by name + IsGlobal),
/// so re-running the command after a partial failure or after adding new
/// seeds is safe.
///
/// Usage:
/// <code>
///   dotnet run -- seed-form-groups
/// </code>
///
/// Currently seeds (per ADR-001 conversation 2026-04-26):
///   1. Contact Information
///   2. Address
///   3. Emergency Contact
///   4. Insurance Information
///   5. Medical Background (shared between chiro and massage)
///   6. Medical History — Chiropractic
///   7. Medical History — Massage Therapy
///   8. Consents &amp; Signature
/// </summary>
public static class FormGroupSeeder
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public static async Task<bool> RunAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var seeds = BuildSeeds();
        int created = 0, upgraded = 0, unchanged = 0;

        foreach (var seed in seeds)
        {
            var seedJson = JsonSerializer.Serialize(seed.Fields, JsonOpts);

            // Look up by (Name + IsGlobal). Multiple groups can share a name
            // across tenants, but in the global namespace it's effectively
            // unique — the seeder owns the global slot.
            var existing = await db.FieldGroups
                .FirstOrDefaultAsync(g => g.IsGlobal && g.Name == seed.Name);

            if (existing is null)
            {
                // First-time seed — create v1.
                var logicalId = Guid.NewGuid();
                var group = new FieldGroup
                {
                    LogicalId = logicalId,
                    Name = seed.Name,
                    Category = seed.Category,
                    IsGlobal = true,
                    ParentLogicalId = null,
                    OwnerPracticeId = null,
                    CurrentVersion = 1
                };
                var version = new FieldGroupVersion
                {
                    FieldGroupLogicalId = logicalId,
                    Version = 1,
                    Name = seed.Name,
                    Description = seed.Description,
                    PhiFlag = seed.PhiFlag,
                    FieldsJson = seedJson,
                    CreatedByUserId = null
                };
                db.FieldGroups.Add(group);
                db.FieldGroupVersions.Add(version);
                await db.SaveChangesAsync();
                Console.WriteLine($"[seed-form-groups] Created: {seed.Name} ({seed.Fields.Count} fields)");
                created++;
                continue;
            }

            // Group already exists — compare its CURRENT version's fields
            // against what the seed wants. If they match, nothing to do.
            // If they don't, append a new version row (Version = max + 1)
            // and bump CurrentVersion. This preserves history (older
            // versions stay in the DB so historical FormInstances render
            // unchanged) while making the seed authoritative for the
            // "current" version of each global group.
            var current = await db.FieldGroupVersions
                .FirstOrDefaultAsync(v =>
                    v.FieldGroupLogicalId == existing.LogicalId &&
                    v.Version == existing.CurrentVersion);

            var sameFields = current is not null && current.FieldsJson == seedJson;
            var sameMeta =
                existing.Category == seed.Category &&
                (current?.Description ?? null) == seed.Description &&
                (current?.PhiFlag ?? false) == seed.PhiFlag;

            if (sameFields && sameMeta)
            {
                Console.WriteLine($"[seed-form-groups] Unchanged: {seed.Name}");
                unchanged++;
                continue;
            }

            // Upgrade — write a new version row and bump the pointer.
            var nextVersion = existing.CurrentVersion + 1;
            existing.Category = seed.Category;
            existing.CurrentVersion = nextVersion;
            existing.UpdatedAt = DateTime.UtcNow;

            db.FieldGroupVersions.Add(new FieldGroupVersion
            {
                FieldGroupLogicalId = existing.LogicalId,
                Version = nextVersion,
                Name = seed.Name,
                Description = seed.Description,
                PhiFlag = seed.PhiFlag,
                FieldsJson = seedJson,
                CreatedByUserId = null
            });
            await db.SaveChangesAsync();
            Console.WriteLine(
                $"[seed-form-groups] Upgraded: {seed.Name} → v{nextVersion} ({seed.Fields.Count} fields)");
            upgraded++;
        }

        Console.WriteLine(
            $"[seed-form-groups] Done. Created {created}, upgraded {upgraded}, unchanged {unchanged}.");
        return true;
    }

    // --- Seed definitions ---

    private record SeedGroup(
        string Name,
        string Category,
        string? Description,
        bool PhiFlag,
        List<Field> Fields);

    private static List<SeedGroup> BuildSeeds() => new()
    {
        // 1. Contact Information ------------------------------------------------
        new SeedGroup(
            Name: "Contact Information",
            Category: "contact",
            Description: "Patient name, date of birth, and primary contact channels.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_contact_info", "Contact Information"),
                S("sec_personal", "Personal Information"),
                F("first_name",  FieldType.Text,    "First Name", FieldWidth.Third, required: true,  maxLength: 50,  phi: true),
                F("middle_init", FieldType.Text,    "MI",         FieldWidth.Quarter, required: false, maxLength: 2,   phi: true),
                F("last_name",   FieldType.Text,    "Last Name",  FieldWidth.Third, required: true,  maxLength: 80,  phi: true),
                F("dob",         FieldType.Date,    "Date of Birth", FieldWidth.Half, required: true,                 phi: true),
                F("sex_gender",  FieldType.Select,  "Sex / Gender", FieldWidth.Half, required: false, phi: true,
                    options: new(){
                        Opt("female","Female"), Opt("male","Male"),
                        Opt("nonbinary","Non-binary"), Opt("prefer_not_to_say","Prefer not to say"), Opt("self_describe","Self-describe")
                    }),
                S("sec_contact", "Contact Channels", "How can we reach you?"),
                F("email",       FieldType.Email,   "Email",       FieldWidth.Half, required: true, maxLength: 254, phi: true),
                F("mobile_phone", FieldType.Phone,  "Mobile Phone", FieldWidth.Half, required: true, maxLength: 20, phi: true),
                F("home_phone",  FieldType.Phone,   "Home Phone",  FieldWidth.Half, required: false, maxLength: 20, phi: true),
                F("preferred_contact", FieldType.Radio, "Preferred contact method", FieldWidth.Full, required: false, phi: true,
                    options: new(){ Opt("email","Email"), Opt("text","Text"), Opt("phone","Phone call") })
            }),

        // 2. Address ------------------------------------------------------------
        new SeedGroup(
            Name: "Address",
            Category: "address",
            Description: "Mailing / billing address.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_address", "Address"),
                F("street",     FieldType.Text, "Street", FieldWidth.Full, required: true, maxLength: 100, phi: true),
                F("apt_unit",   FieldType.Text, "Apt / Unit", FieldWidth.Quarter, required: false, maxLength: 20, phi: true),
                F("city",       FieldType.Text, "City", FieldWidth.Half, required: true, maxLength: 60, phi: true),
                F("state",      FieldType.Text, "State", FieldWidth.Quarter, required: true, maxLength: 50, phi: true),
                F("zip",        FieldType.Text, "Zip / Postal", FieldWidth.Quarter, required: true, maxLength: 20, phi: true)
            }),

        // 3. Emergency Contact --------------------------------------------------
        new SeedGroup(
            Name: "Emergency Contact",
            Category: "contact",
            Description: "Who to reach if something goes wrong during the appointment.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_emergency_contact", "Emergency Contact"),
                F("ec_name",        FieldType.Text,  "Emergency contact name", FieldWidth.Half, required: true, maxLength: 130, phi: true),
                F("ec_relationship", FieldType.Text, "Relationship", FieldWidth.Half, required: true, maxLength: 60, phi: true),
                F("ec_phone",       FieldType.Phone, "Phone", FieldWidth.Half, required: true, maxLength: 20, phi: true)
            }),

        // 4. Insurance Information ---------------------------------------------
        new SeedGroup(
            Name: "Insurance Information",
            Category: "insurance",
            Description: "Carrier, member id, group, policyholder. File uploads for the card front/back are added later when file-blob storage ships.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_insurance_info", "Insurance Information"),
                S("sec_ins_coverage", "Insurance Coverage"),
                F("ins_using", FieldType.Radio, "Are you using insurance for this visit?", FieldWidth.Full, required: true, phi: true,
                    options: new(){ Opt("yes","Yes"), Opt("no","No") }),
                F("ins_carrier",  FieldType.Text, "Insurance carrier", FieldWidth.Half,  required: false, maxLength: 100, phi: true),
                F("ins_member_id", FieldType.Text, "Member ID",        FieldWidth.Half,  required: false, maxLength: 50,  phi: true),
                F("ins_group",    FieldType.Text, "Group number",      FieldWidth.Half,  required: false, maxLength: 50,  phi: true),
                F("ins_policyholder", FieldType.Text, "Policyholder name (if not you)", FieldWidth.Half, required: false, maxLength: 130, phi: true)
            }),

        // 5. Medical Background (shared) ---------------------------------------
        new SeedGroup(
            Name: "Medical Background",
            Category: "medical",
            Description: "Allergies, current meds, and past surgeries. Composed by both chiro and massage histories.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_medical_background", "Medical Background"),
                S("sec_med_allergies", "Allergies & Medications"),
                F("allergies",    FieldType.Textarea, "Allergies", FieldWidth.Full, required: false, maxLength: 500, phi: true,
                    helpText: "List any drug, food, or environmental allergies."),
                F("medications",  FieldType.Textarea, "Current medications", FieldWidth.Full, required: false, maxLength: 1000, phi: true,
                    helpText: "Include prescription, over-the-counter, and supplements."),
                S("sec_med_history", "Health History"),
                F("surgeries",    FieldType.Textarea, "Past surgeries", FieldWidth.Full, required: false, maxLength: 1000, phi: true,
                    helpText: "Approximate dates are fine."),
                F("conditions",   FieldType.CheckboxGroup, "Existing conditions", FieldWidth.Full, required: false, phi: true,
                    options: new(){
                        Opt("diabetes","Diabetes"), Opt("hypertension","High blood pressure"),
                        Opt("heart_disease","Heart disease"), Opt("cancer","Cancer"),
                        Opt("blood_thinners","On blood thinners"), Opt("pregnancy","Currently pregnant"),
                        Opt("none","None of the above")
                    })
            }),

        // 6. Medical History — Chiropractic ------------------------------------
        new SeedGroup(
            Name: "Medical History — Chiropractic",
            Category: "medical",
            Description: "Chiropractor-specific intake including pain location body diagram and condition checklist.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_chiro_history_heading", "Medical History — Chiropractic"),
                S("sec_chief", "Chief Complaint"),
                F("chief_complaint", FieldType.Textarea, "Chief complaint", FieldWidth.Full, required: true, maxLength: 500, phi: true,
                    helpText: "Briefly describe what brings you in today."),
                S("sec_pain", "Pain Details"),
                F("pain_location",   FieldType.BodyDiagram, "Pain location", FieldWidth.Full, required: false, phi: true,
                    helpText: "Mark the area(s) where you're experiencing pain."),
                F("pain_scale",      FieldType.Number, "Pain scale (0–10)", FieldWidth.Half, required: true, phi: true,
                    helpText: "0 = no pain, 10 = worst imaginable."),
                F("onset_date",      FieldType.Date, "When did the pain start?", FieldWidth.Half, required: false, phi: true),
                F("aggravating",     FieldType.Textarea, "What makes it worse?", FieldWidth.Half, required: false, maxLength: 500, phi: true),
                F("relieving",       FieldType.Textarea, "What makes it better?", FieldWidth.Half, required: false, maxLength: 500, phi: true),
                S("sec_chiro_history", "Medical History"),
                F("prior_treatments", FieldType.Textarea, "Prior chiropractic treatments?", FieldWidth.Full, required: false, maxLength: 1000, phi: true),
                F("chiro_conditions", FieldType.CheckboxGroup, "Have you experienced any of these?", FieldWidth.Full, required: false, phi: true,
                    options: new(){
                        Opt("back_pain","Back pain"), Opt("neck_pain","Neck pain"),
                        Opt("sciatica","Sciatica"), Opt("headaches","Headaches"),
                        Opt("herniated_disc","Herniated disc"), Opt("scoliosis","Scoliosis"),
                        Opt("recent_injury","Recent injury / accident")
                    })
            }),

        // 7. Medical History — Massage Therapy ---------------------------------
        new SeedGroup(
            Name: "Medical History — Massage Therapy",
            Category: "medical",
            Description: "Massage-therapy-specific intake including tension/avoid areas, pressure, and contraindications.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_massage_history_heading", "Medical History — Massage Therapy"),
                S("sec_massage_complaint", "What Brings You In"),
                F("massage_complaint", FieldType.Textarea, "What brings you in today?", FieldWidth.Full, required: true, maxLength: 500, phi: true),
                S("sec_focus", "Focus Areas"),
                F("tension_areas", FieldType.BodyDiagram, "Tension / focus areas", FieldWidth.Full, required: false, phi: true,
                    helpText: "Mark areas where you'd like the therapist to focus."),
                F("avoid_areas",  FieldType.BodyDiagram, "Areas to avoid", FieldWidth.Full, required: false, phi: true,
                    helpText: "Mark any area the therapist should avoid (injury, sensitivity, recent surgery)."),
                S("sec_preferences", "Preferences"),
                F("pressure",     FieldType.Radio, "Preferred pressure", FieldWidth.Half, required: true, phi: true,
                    options: new(){ Opt("light","Light"), Opt("medium","Medium"), Opt("deep","Deep / firm") }),
                F("oil_allergies", FieldType.Textarea, "Allergies to oils, lotions, or aromatherapy?", FieldWidth.Half, required: false, maxLength: 500, phi: true),
                F("massage_experience", FieldType.Textarea, "Prior massage experience?", FieldWidth.Full, required: false, maxLength: 1000, phi: true),
                S("sec_contraindications", "Health Considerations"),
                F("contraindications", FieldType.CheckboxGroup, "Any of these apply to you?", FieldWidth.Full, required: false, phi: true,
                    options: new(){
                        Opt("pregnancy","Currently pregnant"), Opt("recent_surgery","Recent surgery (within 3 months)"),
                        Opt("blood_thinners","On blood thinners"), Opt("varicose_veins","Varicose veins"),
                        Opt("skin_condition","Active skin condition"), Opt("none","None of these")
                    })
            }),

        // 8. Consents & Signature ----------------------------------------------
        new SeedGroup(
            Name: "Consents & Signature",
            Category: "consent",
            Description: "HIPAA, informed consent, financial responsibility, cancellation policy, and the e-signature.",
            PhiFlag: true,
            Fields: new()
            {
                S("sec_consents_signature", "Consents & Signature"),
                S("sec_acks", "Acknowledgments", "Please review and check each box to acknowledge."),
                F("hipaa_ack", FieldType.Checkbox, "I acknowledge receipt of the HIPAA Notice of Privacy Practices.", FieldWidth.Full, required: true, phi: false),
                F("informed_consent", FieldType.Checkbox, "I consent to chiropractic and/or massage treatment as recommended by my provider.", FieldWidth.Full, required: true, phi: false),
                F("financial_resp", FieldType.Checkbox, "I understand I am financially responsible for any charges not covered by insurance.", FieldWidth.Full, required: true, phi: false),
                F("cancellation_policy", FieldType.Checkbox, "I understand the practice's cancellation policy.", FieldWidth.Full, required: true, phi: false),
                S("sec_signature", "Signature"),
                F("signature", FieldType.Signature, "Signature (type your full legal name)", FieldWidth.Half, required: true, phi: true,
                    helpText: "Typed signatures are legally valid for these acknowledgments. The IP, time, and document version are recorded."),
                F("signature_date", FieldType.Date, "Date", FieldWidth.Half, required: true, phi: false)
            })
    };

    // --- tiny helpers to keep the seed list readable ---

    private static Field F(
        string id, FieldType type, string label, FieldWidth width,
        bool required, int? maxLength = null, bool phi = false,
        string? helpText = null, List<FieldOption>? options = null) =>
        new()
        {
            Id = id,
            Type = type,
            Label = label,
            Width = width,
            Required = required,
            MaxLength = maxLength,
            HelpText = helpText,
            Options = options,
            PhiFlag = phi
        };

    /// <summary>
    /// Section divider. Title lives in <c>label</c>; optional sub-copy in
    /// <c>helpText</c>. PHI is always false on a section since it doesn't
    /// hold a value. Width is forced to Full so the renderer always breaks
    /// the grid at this row.
    /// </summary>
    private static Field S(string id, string label, string? helpText = null) =>
        new()
        {
            Id = id,
            Type = FieldType.Section,
            Label = label,
            Width = FieldWidth.Full,
            Required = false,
            HelpText = helpText,
            PhiFlag = false
        };

    private static FieldOption Opt(string value, string label) => new() { Value = value, Label = label };
}
