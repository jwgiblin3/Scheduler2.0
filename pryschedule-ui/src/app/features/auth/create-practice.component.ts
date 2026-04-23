import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * "Add a practice to your existing account" page. Visible to any signed-in
 * user who doesn't already own a practice. On success we replace the cached
 * JWT with the new one (which carries the practiceId claim), then drop the
 * user into the admin dashboard.
 */
@Component({
  selector: 'app-create-practice',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-practice.component.html',
  styleUrls: ['./login.component.scss']
})
export class CreatePracticeComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    practiceName: ['', [Validators.required, Validators.minLength(2)]],
    practiceSlug: ['', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9-]+$/),
      Validators.minLength(2)
    ]]
  });

  loading = false;
  error = '';

  user = computed(() => this.auth.currentUser());

  /** Auto-suggest a slug from the practice name as the user types. */
  onNameChange(value: string) {
    const slugCtrl = this.form.controls.practiceSlug;
    if (slugCtrl.dirty) return; // respect manual edits
    const suggested = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    slugCtrl.setValue(suggested, { emitEvent: false });
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Please fill in all fields. Slug can only contain letters, numbers, and hyphens.';
      return;
    }
    this.loading = true;
    this.error = '';
    const v = this.form.value as { practiceName: string; practiceSlug: string };
    // Slugs are stored lowercase in the database — normalize before send.
    v.practiceSlug = String(v.practiceSlug).toLowerCase();
    this.auth.createPractice(v).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: err => {
        if (err?.status === 0) {
          this.error = 'Unable to reach the server. Please check your connection.';
        } else if (err?.status === 401) {
          this.error = 'Your session expired. Please sign in again.';
          this.auth.logout({ returnUrl: '/my/create-practice' });
        } else if (typeof err?.error === 'string' && err.error.trim()) {
          this.error = err.error;
        } else if (Array.isArray(err?.error)) {
          this.error = err.error.join(', ');
        } else {
          this.error = 'Unable to create practice. Please try again.';
        }
        this.loading = false;
      }
    });
  }
}
