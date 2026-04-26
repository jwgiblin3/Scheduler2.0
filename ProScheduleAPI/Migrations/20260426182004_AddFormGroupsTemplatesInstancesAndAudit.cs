using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProScheduleAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddFormGroupsTemplatesInstancesAndAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: true),
                    Role = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Action = table.Column<int>(type: "int", nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    EntityId = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    PracticeId = table.Column<int>(type: "int", nullable: true),
                    ChangedFieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuditLogs_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FieldGroups",
                columns: table => new
                {
                    LogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Category = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    IsGlobal = table.Column<bool>(type: "bit", nullable: false),
                    ParentLogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OwnerPracticeId = table.Column<int>(type: "int", nullable: true),
                    CurrentVersion = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldGroups", x => x.LogicalId);
                    table.ForeignKey(
                        name: "FK_FieldGroups_Practices_OwnerPracticeId",
                        column: x => x.OwnerPracticeId,
                        principalTable: "Practices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FormTemplates",
                columns: table => new
                {
                    LogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    TargetAudience = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    IsGlobal = table.Column<bool>(type: "bit", nullable: false),
                    ParentLogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OwnerPracticeId = table.Column<int>(type: "int", nullable: true),
                    CurrentVersion = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormTemplates", x => x.LogicalId);
                    table.ForeignKey(
                        name: "FK_FormTemplates_Practices_OwnerPracticeId",
                        column: x => x.OwnerPracticeId,
                        principalTable: "Practices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FieldGroupVersions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FieldGroupLogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PhiFlag = table.Column<bool>(type: "bit", nullable: false),
                    ConditionalLogicJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldGroupVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FieldGroupVersions_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FieldGroupVersions_FieldGroups_FieldGroupLogicalId",
                        column: x => x.FieldGroupLogicalId,
                        principalTable: "FieldGroups",
                        principalColumn: "LogicalId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormTemplateVersions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FormTemplateLogicalId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormTemplateVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormTemplateVersions_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FormTemplateVersions_FormTemplates_FormTemplateLogicalId",
                        column: x => x.FormTemplateLogicalId,
                        principalTable: "FormTemplates",
                        principalColumn: "LogicalId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormInstances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AppointmentId = table.Column<int>(type: "int", nullable: false),
                    FormTemplateVersionId = table.Column<int>(type: "int", nullable: false),
                    PinnedGroupVersionsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ResponsesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Snapshot = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SubmissionIp = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormInstances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormInstances_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FormInstances_FormTemplateVersions_FormTemplateVersionId",
                        column: x => x.FormTemplateVersionId,
                        principalTable: "FormTemplateVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_EntityType_EntityId_Timestamp",
                table: "AuditLogs",
                columns: new[] { "EntityType", "EntityId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_PracticeId_Timestamp",
                table: "AuditLogs",
                columns: new[] { "PracticeId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_UserId_Timestamp",
                table: "AuditLogs",
                columns: new[] { "UserId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_FieldGroups_OwnerPracticeId_Category_IsGlobal",
                table: "FieldGroups",
                columns: new[] { "OwnerPracticeId", "Category", "IsGlobal" });

            migrationBuilder.CreateIndex(
                name: "IX_FieldGroups_ParentLogicalId",
                table: "FieldGroups",
                column: "ParentLogicalId");

            migrationBuilder.CreateIndex(
                name: "IX_FieldGroupVersions_CreatedByUserId",
                table: "FieldGroupVersions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FieldGroupVersions_FieldGroupLogicalId_Version",
                table: "FieldGroupVersions",
                columns: new[] { "FieldGroupLogicalId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormInstances_AppointmentId",
                table: "FormInstances",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_FormInstances_FormTemplateVersionId",
                table: "FormInstances",
                column: "FormTemplateVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_FormInstances_Status_SubmittedAt",
                table: "FormInstances",
                columns: new[] { "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplates_OwnerPracticeId_TargetAudience_IsGlobal",
                table: "FormTemplates",
                columns: new[] { "OwnerPracticeId", "TargetAudience", "IsGlobal" });

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplates_ParentLogicalId",
                table: "FormTemplates",
                column: "ParentLogicalId");

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplateVersions_CreatedByUserId",
                table: "FormTemplateVersions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FormTemplateVersions_FormTemplateLogicalId_Version",
                table: "FormTemplateVersions",
                columns: new[] { "FormTemplateLogicalId", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "FieldGroupVersions");

            migrationBuilder.DropTable(
                name: "FormInstances");

            migrationBuilder.DropTable(
                name: "FieldGroups");

            migrationBuilder.DropTable(
                name: "FormTemplateVersions");

            migrationBuilder.DropTable(
                name: "FormTemplates");
        }
    }
}
