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

/** Appointment as seen by a client on "My Appointments". */
export interface MyAppointment {
  id: number;
  practiceName: string;
  practiceSlug: string;
  providerName: string;
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
  bio?: string;
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

export interface IntakeForm {
  id: number;
  appointmentTypeId: number;
  title: string;
  fieldsJson: string;
}

export interface IntakeFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'date' | 'signature';
  required: boolean;
  options?: string[];
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
  providers: PublicProvider[];
  appointmentTypes: AppointmentType[];
}

export interface PublicProvider {
  id: number;
  displayName: string;
  bio?: string;
  appointmentTypeIds: number[];
}
