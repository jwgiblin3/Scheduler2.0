import { Component, inject, OnInit, signal, AfterViewInit, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { IntakeForm, IntakeFormField } from '../../core/models/models';

@Component({
  selector: 'app-intake-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="intake-page">
      <div class="intake-header">
        <div class="header-inner">
          <div class="logo">📅 ProSchedule</div>
        </div>
      </div>

      <div class="container">
        @if (loading()) {
          <div class="loading">Loading form...</div>
        } @else if (!form()) {
          <div class="card">
            <p>No intake form required for this appointment.</p>
          </div>
        } @else {
          <div class="card">
            <h2>{{ form()!.title }}</h2>
            <p class="subtitle">Please complete this form before your appointment.</p>

            @for (field of fields(); track field.id) {
              <div class="form-group">
                <label>{{ field.label }} @if (field.required) { <span class="required">*</span> }</label>

                @switch (field.type) {
                  @case ('text') {
                    <input type="text" [(ngModel)]="responses[field.id]" />
                  }
                  @case ('textarea') {
                    <textarea [(ngModel)]="responses[field.id]" rows="4"></textarea>
                  }
                  @case ('date') {
                    <input type="date" [(ngModel)]="responses[field.id]" />
                  }
                  @case ('radio') {
                    @for (opt of field.options ?? []; track opt) {
                      <label class="radio-label">
                        <input type="radio" [name]="field.id" [value]="opt" [(ngModel)]="responses[field.id]" />
                        {{ opt }}
                      </label>
                    }
                  }
                  @case ('checkbox') {
                    @for (opt of field.options ?? []; track opt) {
                      <label class="radio-label">
                        <input type="checkbox" [value]="opt" (change)="onCheckbox(field.id, opt, $event)" [checked]="isChecked(field.id, opt)" />
                        {{ opt }}
                      </label>
                    }
                  }
                  @case ('signature') {
                    <div class="signature-wrap">
                      <canvas [id]="'sig-' + field.id" width="500" height="150" class="signature-canvas"
                        (mousedown)="startDraw($event, field.id)"
                        (mousemove)="draw($event, field.id)"
                        (mouseup)="endDraw(field.id)"
                        (mouseleave)="endDraw(field.id)"
                        (touchstart)="startDraw($event, field.id)"
                        (touchmove)="draw($event, field.id)"
                        (touchend)="endDraw(field.id)">
                      </canvas>
                      <button type="button" class="btn-clear-sig" (click)="clearSignature(field.id)">Clear</button>
                    </div>
                  }
                  @default {
                    <input type="text" [(ngModel)]="responses[field.id]" />
                  }
                }
              </div>
            }

            @if (error()) { <div class="alert-error">{{ error() }}</div> }

            <button class="btn-submit" [disabled]="submitting()" (click)="submit()">
              {{ submitting() ? 'Submitting...' : 'Submit Form' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .intake-page { min-height: 100vh; background: #f7f8fc; }
    .intake-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 1rem 0; }
    .header-inner { max-width: 600px; margin: 0 auto; padding: 0 1.5rem; }
    .logo { font-size: 1.2rem; font-weight: 700; color: #1a1f36; }
    .container { max-width: 600px; margin: 0 auto; padding: 2rem 1.5rem; }
    .loading { color: #718096; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,.07); }
    h2 { margin: 0 0 .25rem; font-size: 1.25rem; color: #1a1f36; }
    .subtitle { color: #718096; font-size: .9rem; margin: 0 0 1.5rem; }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: .9rem; font-weight: 500; color: #4a5568; margin-bottom: 5px; }
    .required { color: #fc8181; }
    input[type=text], input[type=date], textarea { width: 100%; padding: .65rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    textarea { resize: vertical; }
    .radio-label { display: flex; align-items: center; gap: .4rem; font-size: .9rem; cursor: pointer; margin-bottom: .3rem; font-weight: 400; }
    .radio-label input { width: auto; }
    .btn-submit { width: 100%; padding: .85rem; background: #667eea; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .btn-submit:hover:not(:disabled) { background: #5a67d8; }
    .btn-submit:disabled { opacity: .6; }
    .alert-error { background: #fff5f5; color: #c53030; padding: .6rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: 1rem; }
    .signature-wrap { display: flex; flex-direction: column; gap: .5rem; }
    .signature-canvas { border: 1.5px solid #e2e8f0; border-radius: 6px; cursor: crosshair; touch-action: none; max-width: 100%; background: #fff; }
    .btn-clear-sig { align-self: flex-start; padding: .3rem .75rem; border: 1px solid #e2e8f0; border-radius: 6px; background: transparent; color: #718096; cursor: pointer; font-size: .8rem; }
  `]
})
export class IntakeFormComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  form = signal<IntakeForm | null>(null);
  fields = signal<IntakeFormField[]>([]);
  responses: Record<string, any> = {};
  submitting = signal(false);
  error = signal('');

  apptId = 0;
  token = '';
  slug = '';
  apptTypeId = 0;

  // Signature state
  private drawing: Record<string, boolean> = {};
  private lastPos: Record<string, { x: number; y: number }> = {};

  private getCanvas(fieldId: string): HTMLCanvasElement | null {
    return document.getElementById(`sig-${fieldId}`) as HTMLCanvasElement | null;
  }

  private getPos(event: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (event instanceof MouseEvent) {
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
    }
    const touch = event.touches[0];
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
  }

  startDraw(event: MouseEvent | TouchEvent, fieldId: string) {
    event.preventDefault();
    const canvas = this.getCanvas(fieldId);
    if (!canvas) return;
    this.drawing[fieldId] = true;
    this.lastPos[fieldId] = this.getPos(event, canvas);
  }

  draw(event: MouseEvent | TouchEvent, fieldId: string) {
    event.preventDefault();
    if (!this.drawing[fieldId]) return;
    const canvas = this.getCanvas(fieldId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = this.getPos(event, canvas);
    ctx.beginPath();
    ctx.moveTo(this.lastPos[fieldId].x, this.lastPos[fieldId].y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1f36';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    this.lastPos[fieldId] = pos;
    this.responses[fieldId] = canvas.toDataURL('image/png');
  }

  endDraw(fieldId: string) {
    this.drawing[fieldId] = false;
  }

  clearSignature(fieldId: string) {
    const canvas = this.getCanvas(fieldId);
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    delete this.responses[fieldId];
  }

  isChecked(fieldId: string, opt: string) {
    const val = this.responses[fieldId];
    return Array.isArray(val) && val.includes(opt);
  }

  onCheckbox(fieldId: string, opt: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (!Array.isArray(this.responses[fieldId])) this.responses[fieldId] = [];
    if (checked) this.responses[fieldId] = [...this.responses[fieldId], opt];
    else this.responses[fieldId] = this.responses[fieldId].filter((x: string) => x !== opt);
  }

  submit() {
    this.submitting.set(true);
    this.api.submitIntakeForm({
      appointmentId: this.apptId,
      cancellationToken: this.token,
      responsesJson: JSON.stringify(this.responses)
    }).subscribe({
      next: () => this.router.navigate([`/book/${this.slug}/confirm`], {
        queryParams: { apptId: this.apptId, token: this.token }
      }),
      error: err => {
        this.error.set(err.error || 'Submission failed.');
        this.submitting.set(false);
      }
    });
  }

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug')!;
    const q = this.route.snapshot.queryParams;
    this.apptId = Number(q['apptId']);
    this.token = q['token'];
    this.apptTypeId = Number(q['apptTypeId']);

    this.api.getPublicIntakeForm(this.apptTypeId).subscribe({
      next: f => {
        this.form.set(f);
        try { this.fields.set(JSON.parse(f.fieldsJson)); }
        catch { this.fields.set([]); }
        this.loading.set(false);
      },
      error: () => { this.form.set(null); this.loading.set(false); }
    });
  }
}
