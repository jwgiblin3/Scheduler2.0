/**
 * Admin-only DTO types. Mirrors the C# DTOs in
 * ProScheduleAPI/DTOs/FieldGroupDtos.cs and AuditLogDtos.cs.
 *
 * These are kept separate from the main models.ts so the admin bundle
 * doesn't bloat the public booking flow's load.
 */

// ---- Field shape (Phase 2 model, exposed via FieldGroup edit) ----

/** Mirrors the C# FieldType enum. Numeric values must match. */
export enum FieldType {
  Text = 0,
  Textarea = 1,
  Email = 2,
  Phone = 3,
  Number = 4,
  Date = 5,
  Time = 6,
  DateTime = 7,
  Select = 8,
  Multiselect = 9,
  Radio = 10,
  Checkbox = 11,
  CheckboxGroup = 12,
  Signature = 13,
  File = 14,
  BodyDiagram = 15,
  AddressBlock = 16,
  PaymentMethod = 17
}

/** Layout width: full / half / third / quarter columns. */
export enum FieldWidth {
  Full = 0,
  Half = 1,
  Third = 2,
  Quarter = 3
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConditionalLogic {
  sourceFieldId: string;
  operator: string;   // "equals" — only operator in v1
  value: string;
}

export interface Field {
  id?: string;        // server assigns if missing
  type: FieldType;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  width: FieldWidth;
  maxLength?: number | null;
  minLength?: number | null;
  pattern?: string | null;
  options?: FieldOption[] | null;
  phiFlag: boolean;
  conditionalLogic?: FieldConditionalLogic | null;
}

// ---- FieldGroup ----

export interface FieldGroupListItem {
  logicalId: string;
  name: string;
  category: string | null;
  isGlobal: boolean;
  ownerPracticeId: number | null;
  parentLogicalId: string | null;
  currentVersion: number;
  updatedAt: string;
  deleted: boolean;
}

export interface FieldGroupDetail {
  logicalId: string;
  name: string;
  category: string | null;
  isGlobal: boolean;
  ownerPracticeId: number | null;
  parentLogicalId: string | null;
  currentVersion: number;
  description: string | null;
  phiFlag: boolean;
  fields: Field[];
  updatedAt: string;
  deleted: boolean;
}

export interface FieldGroupVersionSummary {
  id: number;
  version: number;
  name: string;
  description: string | null;
  phiFlag: boolean;
  createdByUserId: number | null;
  createdAt: string;
}

export interface CreateFieldGroupRequest {
  name: string;
  category: string | null;
  description: string | null;
  phiFlag: boolean;
  fields: Field[];
}

export type UpdateFieldGroupRequest = CreateFieldGroupRequest;

// ---- Audit log ----

/** Mirrors the C# AuditAction enum. */
export enum AuditAction {
  Read = 0,
  Create = 1,
  Update = 2,
  Delete = 3,
  Print = 4,
  Export = 5,
  Login = 6,
  FailedLogin = 7,
  Submit = 8,
  Void = 9
}

export interface AuditLogRow {
  id: number;
  timestamp: string;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  role: string | null;
  ipAddress: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  practiceId: number | null;
  practiceName: string | null;
  changedFields: string[] | null;
  note: string | null;
}

export interface AuditLogPage {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditLogRow[];
}

/** Filters for the audit log GET. All optional. */
export interface AuditLogQuery {
  action?: AuditAction;
  entityType?: string;
  userId?: number;
  practiceId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// ---- Form templates ----

export interface FormTemplateListItem {
  logicalId: string;
  name: string;
  targetAudience: string;
  isGlobal: boolean;
  ownerPracticeId: number | null;
  parentLogicalId: string | null;
  currentVersion: number;
  itemCount: number;
  updatedAt: string;
  deleted: boolean;
}

/**
 * One entry in a template's items array. Discriminated by `kind`:
 *  - "group": references an existing FieldGroup (logicalId + version pin)
 *  - "field": embeds a standalone Field inline
 *
 * For "group" items, the server populates `groupName` and `groupFieldCount`
 * on read so the UI can render a card without a round trip per item.
 */
export interface FormTemplateItem {
  kind: 'group' | 'field';
  groupLogicalId?: string | null;
  groupVersion?: number | null;
  groupName?: string | null;
  groupFieldCount?: number | null;
  field?: Field | null;
}

export interface FormTemplateDetail {
  logicalId: string;
  name: string;
  targetAudience: string;
  isGlobal: boolean;
  ownerPracticeId: number | null;
  parentLogicalId: string | null;
  currentVersion: number;
  items: FormTemplateItem[];
  updatedAt: string;
  deleted: boolean;
}

export interface CreateFormTemplateRequest {
  name: string;
  targetAudience: string;
  items: FormTemplateItem[];
}

export type UpdateFormTemplateRequest = CreateFormTemplateRequest;

// ---- Practices admin ----

export interface PracticeAdminSummary {
  id: number;
  name: string;
  slug: string;
  adminEmail: string;
  phone: string | null;
  website: string | null;
  addressSummary: string | null;
  createdAt: string;
  userCount: number;
  providerCount: number;
  clientCount: number;
  appointmentCount: number;
  legacyFormCount: number;
  overrideGroupCount: number;
  overrideTemplateCount: number;
}

// ---- Admin users ----

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  isSelf: boolean;
}

export interface CreateAdminUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}
