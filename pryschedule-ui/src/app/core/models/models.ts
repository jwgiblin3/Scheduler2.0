export interface AuthResponse {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;            // "Admin" | "Staff" | "Client"
  // Practice fields are nullable — clients don't own a practice.
  practiceId?: number | null;
  practiceName?: string | null;
  practiceSlug?: string | null;
  // When true, the signed-in user has appointments booked as a client.
  hasClientAppointments?: boolean;
  phone?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  practiceName: string;
  practiceSlug: string;
}

/** Registration for a client who only books appointments (no practice). */
export interface ClientRegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

/** Adds a practice to an existing signed-in account. */
export interface CreatePracticeRequest {
  practiceName: string;
  practiceSlug: string;
}

/** Appointment as seen by a client on "My Appointments". */
export interface MyAppointment {
  id: number;
  practiceName: string;
  practiceSlug: string;
  // IDs are surfaced alongside the display names so the Modify flow on
  // the booking widget can pre-select the original provider / appointment
  // type without an extra round trip.
  providerId: number;
  providerName: string;
  appointmentTypeId: number;
  appointmentTypeName: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  cancellationToken?: string;
}

export interface Provider {
  id: number;
  displayName: string;
  email?: string;
  phone?: string;
  /** Short provider description shown on the public booking page. Renamed from `bio`. */
  description?: string;
  isActive: boolean;
  availabilities: Availability[];
  appointmentTypeIds: number[];
}

export interface Availability {
  id?: number;
  dayOfWeek: number; // 0=Sunday...6=Saturday
  startTime: string; // "HH:mm:ss"
  endTime: string;
  isActive: boolean;
}

export interface AppointmentType {
  id: number;
  name: string;
  description?: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requiresIntakeForm: boolean;
  isActive: boolean;
  /** IDs of Forms (from the practice Forms library) attached to this type, in display order. */
  formIds?: number[];
}

/** Row in the practice Clients list. */
export interface ClientSummary {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  smsOptIn: boolean;
  createdAt: string;
  appointmentCount: number;
  lastAppointment?: string | null;
}

/** One submitted form response shown on a client's detail page. */
export interface ClientFormResponse {
  id: number;
  appointmentId: number;
  appointmentStartTime: string;
  practiceFormId?: number | null;
  formName: string;
  submittedAt: string;
  /** Raw JSON string — { fieldId: value }. Parsed on the client side. */
  responsesJson: string;
  /** Serialized IntakeFormField[] for the form this response was submitted against. */
  fieldsJson: string;
}

/** Full detail including appointments + form responses. */
export interface ClientDetail {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  smsOptIn: boolean;
  createdAt: string;
  appointments: Array<{
    id: number;
    startTime: string;
    endTime: string;
    providerName: string;
    appointmentTypeName: string;
    status: AppointmentStatus;
    hasIntakeResponse: boolean;
    // Practice-side notes from the appointment (nullable). Surfaced
    // here so the client detail's Notes section can render a unified
    // chronological view across every appointment.
    notes?: string | null;
  }>;
  formResponses: ClientFormResponse[];
}

export interface AppointmentSummary {
  id: number;
  clientName: string;
  clientEmail: string;
  providerName: string;
  appointmentTypeName: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  hasIntakeResponse: boolean;
}

export interface AppointmentDetail extends AppointmentSummary {
  clientId: number;
  clientPhone: string;
  providerId: number;
  appointmentTypeId: number;
  durationMinutes: number;
  notes?: string;
  intakeResponse?: IntakeFormResponse;
}

export enum AppointmentStatus {
  Scheduled = 0,
  Completed = 1,
  Cancelled = 2,
  NoShow = 3
}

export interface AvailableSlot {
  start: string;
  end: string;
}

/**
 * A reusable form definition from the practice's Forms library. A single form
 * can be attached to any number of appointment types (e.g. one "Waiver"
 * shared across Massage, Facial, Acupuncture).
 */
export interface PracticeForm {
  id: number;
  name: string;
  fieldsJson: string;
  updatedAt: string;
}

export interface IntakeFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'date' | 'signature' | 'imagemap';
  required: boolean;
  options?: string[];

  /** imagemap: URL of the base diagram the client clicks on (body diagram, dental chart, etc.). */
  imageUrl?: string;

  /** imagemap: configurable marker key. Admin defines "N = Numbness, B = Burning, ..." */
  markers?: ImageMapMarker[];
}

export interface ImageMapMarker {
  /** Single character stamped onto the image where the client clicks (first letter of the label by convention). */
  letter: string;
  /** Human-readable name shown in the selector (e.g. "Numbness"). */
  label: string;
}

/** Shape stored in responsesJson for an imagemap field. */
export interface ImageMapPoint {
  /** SVG user-space X coordinate (0 – imageWidth). */
  x: number;
  /** SVG user-space Y coordinate (0 – imageHeight). */
  y: number;
  /** The marker letter stamped at this point. */
  letter: string;
}

export interface IntakeFormResponse {
  id: number;
  responsesJson: string;
  submittedAt: string;
}

export interface BookingInfo {
  id: number;
  name: string;
  slug: string;
  timeZone: string;
  /** Practice website — shown as a link in the booking page header. */
  website?: string | null;
  /** Absolute URL to the practice logo. Rendered in the booking header. */
  logoUrl?: string | null;
  /** Hex color used as the booking page banner / accent. */
  bannerColor?: string | null;
  /** Structured address shown on the booking page so clients know where to go. */
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  providers: PublicProvider[];
  appointmentTypes: AppointmentType[];
}

export interface PublicProvider {
  id: number;
  displayName: string;
  description?: string;
  appointmentTypeIds: number[];
}
