import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType } from '../../core/models/models';

@Component({
  selector: 'app-appointment-types-list',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Appointment Types</h1>
        <button class="btn btn-primary" (click)="openNew()">+ New Type</button>
      </div>

      <div class="layout">
        <div class="list-col">
          @for (at of types(); track at.id) {
            <div class="type-card" [class.selected]="selected()?.id === at.id" (click)="select(at)">
              <div class="type-name">{{ at.name }}</div>
              <div class="type-meta">{{ at.durationMinutes }}min
                @if (at.bufferAfterMinutes > 0) { + {{ at.bufferAfterMinutes }}min buffer }
              </div>
              <div class="type-badges">
                <span class="badge" [class.badge-green]="at.isActive" [class.badge-gray]="!at.isActive">{{ at.isActive ? 'Active' : 'Inactive' }}</span>
                @if (at.requiresIntakeForm) { <span class="badge badge-blue">Intake Form</span> }
              </div>
            </div>
          }
        </div>

        <div class="edit-col">
          @if (selected()) {
            <div class="card">
              <h2>{{ isNew() ? 'New Appointment Type' : 'Edit: ' + selected()!.name }}</h2>
              <div class="form-group">
                <label>Name *</label>
                <input [(ngModel)]="editName" placeholder="e.g. 60-min Massage" />
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea [(ngModel)]="editDesc" rows="3" placeholder="Shown to clients during booking..."></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Duration (minutes) *</label>
                  <input type="number" [(ngModel)]="editDuration" min="5" />
                </div>
                <div class="form-group">
                  <label>Buffer Before (min)</label>
                  <input type="number" [(ngModel)]="editBufferBefore" min="0" />
                </div>
                <div class="form-group">
                  <label>Buffer After (min)</label>
                  <input type="number" [(ngModel)]="editBufferAfter" min="0" />
                </div>
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="editRequiresIntake" /> Requires intake form
                </label>
              </div>
              @if (!isNew()) {
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="editIsActive" /> Active
                  </label>
                </div>
              }
              @if (error()) { <div class="alert-error">{{ error() }}</div> }
              <div class="form-actions">
                <button class="btn btn-secondary" (click)="cancel()">Cancel</button>
                <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
                  {{ saving() ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          } @else {
            <div class="empty-detail">Select a type to edit, or click "+ New Type"</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.6rem; color: #1a1f36; }
    .btn { padding: .5rem 1rem; border-radius: 6px; font-size: .85rem; cursor: pointer; border: none; }
    .btn-primary { background: #667eea; color: #fff; }
    .btn-secondary { border: 1.5px solid #e2e8f0; color: #4a5568; background: transparent; }
    .layout { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; }
    .type-card { background: #fff; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: .75rem; cursor: pointer; border: 2px solid transparent; }
    .type-card.selected { border-color: #667eea; }
    .type-name { font-weight: 600; font-size: .95rem; }
    .type-meta { font-size: .78rem; color: #718096; margin-top: 3px; }
    .type-badges { display: flex; gap: .4rem; margin-top: .5rem; }
    .badge { font-size: .7rem; padding: 2px 7px; border-radius: 12px; }
    .badge-green { background: #f0fff4; color: #276749; }
    .badge-gray { background: #f7f8fc; color: #718096; }
    .badge-blue { background: #ebf8ff; color: #2b6cb0; }
    .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    h2 { margin: 0 0 1.25rem; font-size: 1.1rem; }
    .form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    input, textarea { width: 100%; padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    .checkbox-label { display: flex; align-items: center; gap: .4rem; cursor: pointer; }
    .checkbox-label input { width: auto; }
    .form-actions { display: flex; gap: .75rem; justify-content: flex-end; }
    .alert-error { background: #fff5f5; color: #c53030; padding: .6rem; border-radius: 6px; font-size: .85rem; margin-bottom: .75rem; }
    .empty-detail { color: #a0aec0; text-align: center; padding: 3rem 0; font-size: .9rem; }
    .btn-primary:disabled { opacity: .6; }
  `]
})
export class AppointmentTypesListComponent implements OnInit {
  private api = inject(ApiService);

  types = signal<AppointmentType[]>([]);
  selected = signal<AppointmentType | null>(null);
  isNew = signal(false);
  saving = signal(false);
  error = signal('');

  editName = ''; editDesc = ''; editDuration = 60;
  editBufferBefore = 0; editBufferAfter = 0;
  editRequiresIntake = false; editIsActive = true;

  select(at: AppointmentType) {
    this.isNew.set(false);
    this.selected.set(at);
    this.editName = at.name; this.editDesc = at.description ?? '';
    this.editDuration = at.durationMinutes; this.editBufferBefore = at.bufferBeforeMinutes;
    this.editBufferAfter = at.bufferAfterMinutes; this.editRequiresIntake = at.requiresIntakeForm;
    this.editIsActive = at.isActive;
  }

  openNew() {
    this.isNew.set(true);
    this.selected.set({ id: 0, name: '', durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, requiresIntakeForm: false, isActive: true });
    this.editName = ''; this.editDesc = ''; this.editDuration = 60;
    this.editBufferBefore = 0; this.editBufferAfter = 0;
    this.editRequiresIntake = false; this.editIsActive = true;
  }

  cancel() { this.selected.set(null); }

  save() {
    this.saving.set(true);
    const body = { name: this.editName, description: this.editDesc, durationMinutes: this.editDuration, bufferBeforeMinutes: this.editBufferBefore, bufferAfterMinutes: this.editBufferAfter, requiresIntakeForm: this.editRequiresIntake, isActive: this.editIsActive };
    const obs = this.isNew()
      ? this.api.createAppointmentType(body)
      : this.api.updateAppointmentType(this.selected()!.id, body);

    obs.subscribe({
      next: () => { this.saving.set(false); this.selected.set(null); this.load(); },
      error: err => { this.error.set(err.error || 'Save failed.'); this.saving.set(false); }
    });
  }

  load() {
    this.api.getAppointmentTypes().subscribe(data => this.types.set(data));
  }

  ngOnInit() { this.load(); }
}
