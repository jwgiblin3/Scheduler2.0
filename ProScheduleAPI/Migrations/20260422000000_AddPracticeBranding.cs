using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddPracticeBranding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Website was added to the Practice model earlier but never got its
            // own migration. Add it here alongside the new branding columns so
            // the schema catches up with the model.
            migrationBuilder.AddColumn<string>(
                name: "Website",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoUrl",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BannerColor",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BannerColor",
                table: "Practices");

            migrationBuilder.DropColumn(
                name: "LogoUrl",
                table: "Practices");

            migrationBuilder.DropColumn(
                name: "Website",
                table: "Practices");
        }
    }
}
