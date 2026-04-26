using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddSuperAdminRoleAndConstraint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_AspNetUsers_SuperAdmin_NoPracticeId",
                table: "AspNetUsers",
                sql: "([Role] <> -1) OR ([PracticeId] IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AspNetUsers_SuperAdmin_NoPracticeId",
                table: "AspNetUsers");
        }
    }
}
