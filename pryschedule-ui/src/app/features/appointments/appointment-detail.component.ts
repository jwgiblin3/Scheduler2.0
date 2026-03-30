import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentDetail, AppointmentStatus } from '../../core/models/models';

@Component({
  selector: 'app-appointment-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <div class="page">
      <a routerLink="/appointments" class="back">← Back to Appointments</a>

      @if (loading()) {
        <div class="loading">Loading...</div>
      } @else if (appt()) {
        <div class="detail-layout">
          <div class="main-card card">
            <div class="card-header">
              <div>
                <h1>{{ appt()!.appointmentTypeName }}</h1>
                <div class="meta">{{ appt()!.startTime | date:'EEEE, MMMM d, y · h:mm a' }} – {{ appt()!.endTime | date:'h:mm a' }}</div>
              </div>
              <span class="badge status-{{ appt()!.status }}">{{ statusLabel(appt()!.status) }}</span>
            </div>

            <div class="info-grid">
              <div class="info-block">
                <div class="info-label">Client</div>
                <div class="info-value">{{ appt()!.clientName }}</div>
                <div class="info-sub">{{ appt()!.clientEmail }}</div>
                @if (appt()!.clientPhone) { <div class="info-sub">{{ appt()!.clientPhone }}</div> }
              </div>
              <div class="info-block">
                <div class="info-label">Provider</div>
                <div class="info-value">{{ appt()!.providerName }}</div>
              </div>
              <div class="info-block">
                <div class="info-label">Duration</div>
                <div class="info-value">{{ appt()!.durationMinutes }} minutes</div>
              </div>
            </div>

            @if (appt()!.notes) {
              <div class="notes-block">
                <div class="info-label">Notes</div>
                <p>{{ appt()!.notes }}</p>
              </div>
            }

            @if (appt()!.status === 0) {
              <div class="actions">
                <button class="btn btn-success" (click)="updateStatus(1)">Mark Completed</button>
                <button class="btn btn-danger" (click)="updateStatus(2)">Cancel</button>
                <button class="btn btn-warning" (click)="updateStatus(3)">No Show</button>
              </div>
            }
          </div>

          <div class="side-card card">
            <h3>Intake Form</h3>
            @if (appt()!.hasIntakeResponse && appt()!.intakeResponse) {
              <div class="intake-submitted">
                <div class="badge badge-green">Submitted {{ appt()!.intakeResponse!.submittedAt | date:'MMM d, y' }}</div>
                <div class="intake-data">
                  <pre>{{ formatResponses(appt()!.intakeResponse!.responsesJson) }}</pre>
                </div>
              </div>
            } @else {
              <div class="intake-pending">
                <span class="badge badge-gray">Not yet submitted</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 900px; }
    .back { color: #667eea; text-decoration: none; font-size: .85rem; display: block; margin-bottom: 1.5rem; }
    .loading { color: #718096; }
    .detail-layout { display: grid; grid-template-columns: 1fr 280px; gap: 1.5rem; }
    .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.3rem; color: #1a1f36; }
    .meta { font-size: .85rem; color: #718096; margin-top: .25rem; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .info-label { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #a0aec0; margin-bottom: .25rem; }
    .info-value { font-size: .95rem; font-weight: 500; }
    .info-sub { font-size: .8rem; color: #718096; }
    .notes-block { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f7f8fc; }
    .notes-block p { margin: .5rem 0 0; color: #4a5568; font-size: .9rem; }
    .actions { display: flex; gap: .5rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f7f8fc; }
    .btn { padding: .5rem 1rem; border: none; border-radius: 6px; cursor: pointer; font-size: .85rem; }
    .btn-success { background: #48bb78; color: #fff; }
    .btn-danger { background: #fc8181; color: #fff; }
    .btn-warning { background: #f6ad55; color: #fff; }
    .badge { display: inline-block; font-size: .75rem; padding: 3px 10px; border-radius: 12px; }
    .status-0 { background: #ebf8ff; color: #2b6cb0; }
    .status-1 { background: #f0fff4; color: #276749; }
    .status-2 { background: #fff5f5; color: #c53030; }
    .status-3 { background: #fffaf0; color: #c05621; }
    .badge-green { background: #f0fff4; color: #276749; }
    .badge-gray { background: #f7f8fc; color: #718096; }
    h3 { margin: 0 0 1rem; font-size: 1rem; }
    .intake-data pre { background: #f7f8fc; border-radius: 6px; padding: .75rem; font-size: .78rem; overflow: auto; margin-top: .75rem; }
  `]
})
export class AppointmentDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  appt = signal<AppointmentDetail | null>(null);

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  formatResponses(json: string) {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  updateStatus(status: AppointmentStatus) {
    const id = this.appt()!.id;
    this.api.updateAppointmentStatus(id, status).subscribe(() => {
      this.appt.update(a => a ? { ...a, status } : null);
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getAppointment(id).subscribe({
      next: data => { this.appt.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
