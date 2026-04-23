using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddClientAppUserLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. AspNetUsers.PracticeId becomes nullable so client-only accounts
            //    (with no practice) can exist.
            migrationBuilder.AlterColumn<int>(
                name: "PracticeId",
                table: "AspNetUsers",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            // 2. Clients.AppUserId — optional link back to AspNetUsers so we can
            //    list a signed-in client's appointments across every practice.
            migrationBuilder.AddColumn<int>(
                name: "AppUserId",
                table: "Clients",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Clients_AppUserId",
                table: "Clients",
                column: "AppUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Clients_AspNetUsers_AppUserId",
                table: "Clients",
                column: "AppUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Clients_AspNetUsers_AppUserId",
                table: "Clients");

            migrationBuilder.DropIndex(
                name: "IX_Clients_AppUserId",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "AppUserId",
                table: "Clients");

            migrationBuilder.AlterColumn<int>(
                name: "PracticeId",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
