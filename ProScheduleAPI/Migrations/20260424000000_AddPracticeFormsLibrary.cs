using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    /// <remarks>
    /// Restructures intake forms into a practice-level library. Forms are now
    /// named (Waiver, Intake, New Customer, etc.) and can be attached to any
    /// number of appointment types via a join table.
    ///
    /// Data move:
    ///   1. Create PracticeForms + AppointmentTypeForms tables.
    ///   2. Copy each existing IntakeForm row into PracticeForms (Title → Name),
    ///      and record the old-row-id → new-row-id mapping in a temp column so
    ///      we can rebuild AppointmentType attachments.
    ///   3. Insert one AppointmentTypeForm row per migrated form.
    ///   4. Add nullable PracticeFormId to IntakeFormResponses + drop the unique
    ///      constraint on AppointmentId so multiple responses can share an
    ///      appointment.
    ///   5. Drop the old IntakeForms table.
    /// </remarks>
    public partial class AddPracticeFormsLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // --- 1. New tables ---
            migrationBuilder.CreateTable(
                name: "PracticeForms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PracticeId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    // Temp column: the old IntakeForm.Id this row was seeded from.
                    // Dropped at the end of Up() once the join table is built.
                    LegacyIntakeFormId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PracticeForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PracticeForms_Practices_PracticeId",
                        column: x => x.PracticeId,
                        principalTable: "Practices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PracticeForms_PracticeId",
                table: "PracticeForms",
                column: "PracticeId");

            migrationBuilder.CreateTable(
                name: "AppointmentTypeForms",
                columns: table => new
                {
                    AppointmentTypeId = table.Column<int>(type: "int", nullable: false),
                    PracticeFormId = table.Column<int>(type: "int", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppointmentTypeForms", x => new { x.AppointmentTypeId, x.PracticeFormId });
                    table.ForeignKey(
                        name: "FK_AppointmentTypeForms_AppointmentTypes_AppointmentTypeId",
                        column: x => x.AppointmentTypeId,
                        principalTable: "AppointmentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AppointmentTypeForms_PracticeForms_PracticeFormId",
                        column: x => x.PracticeFormId,
                        principalTable: "PracticeForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AppointmentTypeForms_PracticeFormId",
                table: "AppointmentTypeForms",
                column: "PracticeFormId");

            // --- 2+3. Data migration from IntakeForms ---
            // Copy existing forms into the library (one form per old AppointmentType)
            // and then seed attachment rows from the legacy AppointmentTypeId link.
            migrationBuilder.Sql(@"
                INSERT INTO PracticeForms (PracticeId, Name, FieldsJson, UpdatedAt, LegacyIntakeFormId)
                SELECT at.PracticeId,
                       CASE WHEN LTRIM(RTRIM(ISNULL(ifs.Title, ''))) = '' THEN 'Intake' ELSE ifs.Title END,
                       ifs.FieldsJson,
                       ifs.UpdatedAt,
                       ifs.Id
                FROM IntakeForms ifs
                INNER JOIN AppointmentTypes at ON at.Id = ifs.AppointmentTypeId;
            ");

            migrationBuilder.Sql(@"
                INSERT INTO AppointmentTypeForms (AppointmentTypeId, PracticeFormId, SortOrder)
                SELECT ifs.AppointmentTypeId, pf.Id, 0
                FROM IntakeForms ifs
                INNER JOIN PracticeForms pf ON pf.LegacyIntakeFormId = ifs.Id;
            ");

            // Temp column has served its purpose — drop it so the schema matches
            // what the model snapshot describes.
            migrationBuilder.DropColumn(name: "LegacyIntakeFormId", table: "PracticeForms");

            // --- 4. IntakeFormResponses changes ---
            // The previous schema had a unique index on AppointmentId (one
            // response per appointment). With multiple forms per type each
            // appointment can accumulate multiple responses.
            migrationBuilder.DropIndex(
                name: "IX_IntakeFormResponses_AppointmentId",
                table: "IntakeFormResponses");

            migrationBuilder.AddColumn<int>(
                name: "PracticeFormId",
                table: "IntakeFormResponses",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_IntakeFormResponses_AppointmentId_PracticeFormId",
                table: "IntakeFormResponses",
                columns: new[] { "AppointmentId", "PracticeFormId" });

            migrationBuilder.AddForeignKey(
                name: "FK_IntakeFormResponses_PracticeForms_PracticeFormId",
                table: "IntakeFormResponses",
                column: "PracticeFormId",
                principalTable: "PracticeForms",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // --- 5. Drop the old IntakeForms table ---
            migrationBuilder.DropTable(name: "IntakeForms");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recreate IntakeForms (best-effort — Title is re-derived from Name).
            migrationBuilder.CreateTable(
                name: "IntakeForms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AppointmentTypeId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IntakeForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IntakeForms_AppointmentTypes_AppointmentTypeId",
                        column: x => x.AppointmentTypeId,
                        principalTable: "AppointmentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IntakeForms_AppointmentTypeId",
                table: "IntakeForms",
                column: "AppointmentTypeId",
                unique: true);

            // Seed back the first form of each appointment type — the rest of
            // the library is lost on downgrade since the legacy schema only
            // permits one form per type.
            migrationBuilder.Sql(@"
                INSERT INTO IntakeForms (AppointmentTypeId, Title, FieldsJson, UpdatedAt)
                SELECT atf.AppointmentTypeId, pf.Name, pf.FieldsJson, pf.UpdatedAt
                FROM AppointmentTypeForms atf
                INNER JOIN PracticeForms pf ON pf.Id = atf.PracticeFormId
                WHERE atf.SortOrder = (
                    SELECT MIN(SortOrder) FROM AppointmentTypeForms a2
                    WHERE a2.AppointmentTypeId = atf.AppointmentTypeId
                );
            ");

            migrationBuilder.DropForeignKey(
                name: "FK_IntakeFormResponses_PracticeForms_PracticeFormId",
                table: "IntakeFormResponses");

            migrationBuilder.DropIndex(
                name: "IX_IntakeFormResponses_AppointmentId_PracticeFormId",
                table: "IntakeFormResponses");

            migrationBuilder.DropColumn(
                name: "PracticeFormId",
                table: "IntakeFormResponses");

            migrationBuilder.CreateIndex(
                name: "IX_IntakeFormResponses_AppointmentId",
                table: "IntakeFormResponses",
                column: "AppointmentId",
                unique: true);

            migrationBuilder.DropTable(name: "AppointmentTypeForms");
            migrationBuilder.DropTable(name: "PracticeForms");
        }
    }
}
