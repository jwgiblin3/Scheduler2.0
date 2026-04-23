import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Provider, AppointmentType, AppointmentSummary, AppointmentDetail,
  AvailableSlot, IntakeForm, BookingInfo, MyAppointment
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // --- Providers ---
  getProviders() {
    return this.http.get<Provider[]>(`${this.base}/providers`);
  }

  getProvider(id: number) {
    return this.http.get<Provider>(`${this.base}/providers/${id}`);
  }

  createProvider(body: Partial<Provider>) {
    return this.http.post<Provider>(`${this.base}/providers`, body);
  }

  updateProvider(id: number, body: Partial<Provider>) {
    return this.http.put<Provider>(`${this.base}/providers/${id}`, body);
  }

  deleteProvider(id: number) {
    return this.http.delete(`${this.base}/providers/${id}`);
  }

  // --- Appointment Types ---
  getAppointmentTypes() {
    return this.http.get<AppointmentType[]>(`${this.base}/appointmenttypes`);
  }

  createAppointmentType(body: Partial<AppointmentType>) {
    return this.http.post<AppointmentType>(`${this.base}/appointmenttypes`, body);
  }

  updateAppointmentType(id: number, body: Partial<AppointmentType>) {
    return this.http.put<AppointmentType>(`${this.base}/appointmenttypes/${id}`, body);
  }

  deleteAppointmentType(id: number) {
    return this.http.delete(`${this.base}/appointmenttypes/${id}`);
  }

  // --- Appointments ---
  getAppointments(filters?: {
    from?: string; to?: string; providerId?: number;
    appointmentTypeId?: number; status?: number;
  }) {
    let params = new HttpParams();
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    if (filters?.providerId != null) params = params.set('providerId', filters.providerId);
    if (filters?.appointmentTypeId != null) params = params.set('appointmentTypeId', filters.appointmentTypeId);
    if (filters?.status != null) params = params.set('status', filters.status);
    return this.http.get<AppointmentSummary[]>(`${this.base}/appointments`, { params });
  }

  getAppointment(id: number) {
    return this.http.get<AppointmentDetail>(`${this.base}/appointments/${id}`);
  }

  updateAppointmentStatus(id: number, status: number, notes?: string) {
    return this.http.put(`${this.base}/appointments/${id}`, { status, notes });
  }

  getAvailability(providerId: number, appointmentTypeId: number, date: string) {
    const params = new HttpParams()
      .set('providerId', providerId)
      .set('appointmentTypeId', appointmentTypeId)
      .set('date', date);
    return this.http.get<AvailableSlot[]>(`${this.base}/appointments/availability`, { params });
  }

  // --- Intake Forms ---
  getIntakeForm(appointmentTypeId: number) {
    return this.http.get<IntakeForm>(`${this.base}/intakeforms/appointment-type/${appointmentTypeId}`);
  }

  saveIntakeForm(appointmentTypeId: number, title: string, fieldsJson: string) {
    return this.http.put<IntakeForm>(
      `${this.base}/intakeforms/appointment-type/${appointmentTypeId}`,
      { title, fieldsJson }
    );
  }

  // --- Public Booking ---
  getPublicPractice(slug: string) {
    return this.http.get<BookingInfo>(`${this.base}/public/${slug}`);
  }

  getPublicIntakeForm(appointmentTypeId: number) {
    return this.http.get<IntakeForm>(`${this.base}/intakeforms/public/${appointmentTypeId}`);
  }

  bookAppointment(practiceSlug: string, body: object) {
    return this.http.post<{ id: number; cancellationToken: string; startTime: string; endTime: string; requiresIntakeForm: boolean }>(
      `${this.base}/appointments/book?practiceSlug=${practiceSlug}`, body
    );
  }

  submitIntakeForm(body: { appointmentId: number; cancellationToken: string; responsesJson: string }) {
    return this.http.post(`${this.base}/intakeforms/submit`, body);
  }

  exportAppointmentsCsv(filters?: { from?: string; to?: string; providerId?: number; appointmentTypeId?: number; status?: number }) {
    let params = new HttpParams();
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    if (filters?.providerId != null) params = params.set('providerId', filters.providerId);
    if (filters?.appointmentTypeId != null) params = params.set('appointmentTypeId', filters.appointmentTypeId);
    if (filters?.status != null) params = params.set('status', filters.status);
    return this.http.get(`${this.base}/appointments/export`, { params, responseType: 'blob' });
  }

  getClientAppointments(clientId: number) {
    return this.http.get<any[]>(`${this.base}/appointments/client/${clientId}`);
  }

  /** Appointments belonging to the currently signed-in client (JWT resolves identity). */
  getMyAppointments() {
    return this.http.get<MyAppointment[]>(`${this.base}/appointments/me`);
  }

  getPracticeSettings() {
    return this.http.get<any>(`${this.base}/settings/practice`);
  }

  updatePracticeSettings(body: object) {
    return this.http.put(`${this.base}/settings/practice`, body);
  }

  updateNotificationSettings(body: object) {
    return this.http.put(`${this.base}/settings/notifications`, body);
  }

  // --- Practice holidays ---
  getHolidays() {
    return this.http.get<{ id: number; startDate: string; endDate: string; name: string | null }[]>(
      `${this.base}/settings/holidays`
    );
  }

  createHoliday(body: { startDate: string; endDate: string; name?: string | null }) {
    return this.http.post<{ id: number; startDate: string; endDate: string; name: string | null }>(
      `${this.base}/settings/holidays`, body
    );
  }

  updateHoliday(id: number, body: { startDate: string; endDate: string; name?: string | null }) {
    return this.http.put(`${this.base}/settings/holidays/${id}`, body);
  }

  deleteHoliday(id: number) {
    return this.http.delete(`${this.base}/settings/holidays/${id}`);
  }

  // --- Provider exceptions ---
  getProviderExceptions(providerId: number) {
    return this.http.get<{ id: number; startDate: string; endDate: string; reason: string | null }[]>(
      `${this.base}/providers/${providerId}/exceptions`
    );
  }

  createProviderException(providerId: number, body: { startDate: string; endDate: string; reason?: string | null }) {
    return this.http.post<{ id: number; startDate: string; endDate: string; reason: string | null }>(
      `${this.base}/providers/${providerId}/exceptions`, body
    );
  }

  updateProviderException(providerId: number, exceptionId: number, body: { startDate: string; endDate: string; reason?: string | null }) {
    return this.http.put(`${this.base}/providers/${providerId}/exceptions/${exceptionId}`, body);
  }

  deleteProviderException(providerId: number, exceptionId: number) {
    return this.http.delete(`${this.base}/providers/${providerId}/exceptions/${exceptionId}`);
  }

  cancelAppointment(cancellationToken: string) {
    return this.http.post(`${this.base}/appointments/cancel`, { cancellationToken });
  }

  rescheduleAppointment(cancellationToken: string, newStartTime: string) {
    return this.http.post(`${this.base}/appointments/reschedule`, { cancellationToken, newStartTime });
  }
}
