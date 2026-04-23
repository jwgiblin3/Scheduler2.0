using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    public partial class SplitAddressAndRenameBio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // --- Practice: split single Address string into structured fields.
            // The legacy Address column is kept for now so no data is lost on
            // upgrade. Admins can re-enter the structured values from Settings.
            migrationBuilder.AddColumn<string>(
                name: "AddressLine1",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "State",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PostalCode",
                table: "Practices",
                type: "nvarchar(max)",
                nullable: true);

            // --- Provider: "Bio" is really a short description shown to clients;
            // rename to keep the domain language clear.
            migrationBuilder.RenameColumn(
                name: "Bio",
                table: "Providers",
                newName: "Description");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Description",
                table: "Providers",
                newName: "Bio");

            migrationBuilder.DropColumn(name: "PostalCode", table: "Practices");
            migrationBuilder.DropColumn(name: "State", table: "Practices");
            migrationBuilder.DropColumn(name: "City", table: "Practices");
            migrationBuilder.DropColumn(name: "AddressLine1", table: "Practices");
        }
    }
}
