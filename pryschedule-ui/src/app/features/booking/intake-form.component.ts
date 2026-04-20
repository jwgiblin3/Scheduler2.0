import { Component, inject, OnInit, signal, AfterViewInit, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { IntakeForm, IntakeFormField } from '../../core/models/models';

@Component({
  selector: 'app-intake-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './intake-form.component.html',
  styleUrls: ['./intake-form.component.scss']
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
