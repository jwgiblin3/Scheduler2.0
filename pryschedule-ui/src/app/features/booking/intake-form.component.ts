import { Component, inject, OnInit, signal, AfterViewInit, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PracticeForm, IntakeFormField, ImageMapPoint } from '../../core/models/models';

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
  form = signal<PracticeForm | null>(null);
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

  // ---- Image-map state ----
  //
  // activeMarker[fieldId] — which marker letter is "armed" to be stamped on
  // the next click. We don't auto-pick one; the client must choose explicitly
  // so they never accidentally stamp the wrong letter.
  activeMarker: Record<string, string> = {};
  // imagemapViewBox[fieldId] — SVG viewBox dimensions, sized to the natural
  // pixel dimensions of the loaded image so coordinate math is 1-to-1 with
  // what the client sees. We default to 500x600 (body-chart proportions)
  // until the image's <load> event fires and gives us real dimensions.
  imagemapViewBox: Record<string, { w: number; h: number }> = {};
  // Points are kept in responses[fieldId] as ImageMapPoint[] — reading/
  // writing through helpers keeps Angular's change detection predictable.

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

  // ---- Image-map handlers ----

  /** Initialize viewBox when the loaded image reports its natural dimensions. */
  onImagemapImageLoad(fieldId: string, event: Event) {
    const img = event.target as SVGImageElement & { naturalWidth?: number; naturalHeight?: number };
    // SVG <image> doesn't directly expose natural dims the way HTMLImageElement
    // does, so we fall back to a sensible default if we can't read them.
    const w = (img as any).width?.baseVal?.value || 500;
    const h = (img as any).height?.baseVal?.value || 600;
    if (!this.imagemapViewBox[fieldId]) {
      this.imagemapViewBox[fieldId] = { w, h };
    }
  }

  selectMarker(fieldId: string, letter: string) {
    // Toggle: clicking the armed marker again disarms it.
    this.activeMarker[fieldId] = this.activeMarker[fieldId] === letter ? '' : letter;
  }

  /** Return the current points for a field, initializing storage on first access. */
  getImagemapPoints(fieldId: string): ImageMapPoint[] {
    const value = this.responses[fieldId];
    if (Array.isArray(value)) return value as ImageMapPoint[];
    this.responses[fieldId] = [];
    return this.responses[fieldId];
  }

  /**
   * Stamp a new point at the SVG-space coordinate of the click. We use the
   * SVG's own coordinate transform matrix so placements survive rescaling
   * across phones, tablets, and desktops.
   */
  recordImagemapPoint(field: IntakeFormField, event: MouseEvent) {
    const letter = this.activeMarker[field.id];
    if (!letter) return; // no marker armed — ignore the click
    const svg = event.currentTarget as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const points = this.getImagemapPoints(field.id);
    points.push({ x: Math.round(local.x), y: Math.round(local.y), letter });
    // Re-assign so Angular notices the change through the proxy.
    this.responses[field.id] = [...points];
  }

  removeImagemapPoint(fieldId: string, index: number, event: MouseEvent) {
    // Stop the click from bubbling to the SVG and creating a fresh point.
    event.stopPropagation();
    const points = this.getImagemapPoints(fieldId);
    points.splice(index, 1);
    this.responses[fieldId] = [...points];
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
        try {
          const parsed = JSON.parse(f.fieldsJson) as IntakeFormField[];
          this.fields.set(Array.isArray(parsed) ? parsed : []);
          this.seedImagemapDefaults();
        } catch {
          this.fields.set([]);
        }
        this.loading.set(false);
      },
      error: () => { this.form.set(null); this.loading.set(false); }
    });
  }

  /** Make sure every imagemap field has a viewBox entry + empty point array. */
  private seedImagemapDefaults() {
    for (const f of this.fields()) {
      if (f.type !== 'imagemap') continue;
      // Default proportions match a standard body-chart; replaced as soon as
      // the <image> load event reports real dimensions.
      if (!this.imagemapViewBox[f.id]) {
        this.imagemapViewBox[f.id] = { w: 500, h: 600 };
      }
      if (!Array.isArray(this.responses[f.id])) {
        this.responses[f.id] = [];
      }
    }
  }
}
