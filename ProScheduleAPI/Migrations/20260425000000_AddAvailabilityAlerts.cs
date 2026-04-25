using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    /// <remarks>
    /// Stores client-submitted waitlist requests: "alert me if an earlier
    /// slot becomes available". Preferences (day-of-week + time-of-day
    /// buckets) are serialized as JSON so the shape can evolve without
    /// schema churn.
    /// </remarks>
    public partial class AddAvailabilityAlerts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AvailabilityAlerts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PracticeId = table.Column<int>(type: "int", nullable: false),
                    AppointmentTypeId = table.Column<int>(type: "int", nullable: false),
                    ProviderId = table.Column<int>(type: "int", nullable: true),
                    ClientName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PreferencesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    FulfilledAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AvailabilityAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AvailabilityAlerts_Practices_PracticeId",
                        column: x => x.PracticeId,
                        principalTable: "Practices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityAlerts_PracticeId_IsActive",
                table: "AvailabilityAlerts",
                columns: new[] { "PracticeId", "IsActive" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AvailabilityAlerts");
        }
    }
}
