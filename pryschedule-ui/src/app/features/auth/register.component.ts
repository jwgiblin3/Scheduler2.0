import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  // maxLength values mirror server-side caps in ADR-001 §6 / Phase 0
  // entity annotations. Server is the source of truth; these give inline
  // feedback before the request is even sent.
  form = this.fb.group({
    firstName:     ['', [Validators.required, Validators.maxLength(50)]],
    lastName:      ['', [Validators.required, Validators.maxLength(80)]],
    email:         ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password:      ['', [Validators.required, Validators.minLength(8)]],
    practiceName:  ['', [Validators.required, Validators.maxLength(120)]],
    practiceSlug:  ['', [Validators.required, Validators.maxLength(80),
                         Validators.pattern(/^[a-zA-Z0-9-]+$/)]]
  });

  loading = false;
  error = '';

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = this.describeFormErrors();
      return;
    }
    this.loading = true;
    this.error = '';
    const v = this.form.value as any;
    // Slugs are stored and resolved lowercase — normalize before send so
    // "My-Clinic" and "my-clinic" both map to the same practice URL.
    if (v.practiceSlug) v.practiceSlug = String(v.practiceSlug).toLowerCase();
    this.auth.register(v).subscribe({
      next: () => this.router.navigateByUrl(this.auth.postLoginRoute()),
      error: err => {
        if (err.status === 0) {
          this.error = 'Unable to reach the server. Please check your connection.';
        } else if (Array.isArray(err.error)) {
          this.error = err.error.join(', ');
        } else if (typeof err.error === 'string' && err.error) {
          this.error = err.error;
        } else {
          this.error = 'Registration failed. Please try again.';
        }
        this.loading = false;
      }
    });
  }

  /**
   * Build a human-readable error message that names which field(s) are
   * invalid and why — much more useful than "fill in the required fields".
   */
  private describeFormErrors(): string {
    const labels: Record<string, string> = {
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      password: 'Password',
      practiceName: 'Practice name',
      practiceSlug: 'Booking URL slug'
    };
    const messages: string[] = [];
    for (const [key, label] of Object.entries(labels)) {
      const ctrl = this.form.get(key);
      if (!ctrl || ctrl.valid) continue;
      const errs = ctrl.errors ?? {};
      if (errs['required']) {
        messages.push(`${label} is required.`);
      } else if (errs['email']) {
        messages.push(`${label} must be a valid email address.`);
      } else if (errs['minlength']) {
        const req = errs['minlength'].requiredLength;
        messages.push(`${label} must be at least ${req} characters.`);
      } else if (errs['maxlength']) {
        const req = errs['maxlength'].requiredLength;
        messages.push(`${label} must be ${req} characters or fewer.`);
      } else if (errs['pattern']) {
        if (key === 'practiceSlug') {
          messages.push('Booking URL slug can only contain letters, numbers, and hyphens (no spaces or other punctuation).');
        } else {
          messages.push(`${label} has an invalid format.`);
        }
      } else {
        messages.push(`${label} is invalid.`);
      }
    }
    return messages.length ? messages.join(' ') : 'Please fill in all required fields correctly.';
  }
}
