import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-client-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './client-register.component.html',
  styleUrls: ['./login.component.scss']
})
export class ClientRegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  loading = false;
  error = '';

  /** Optional ?returnUrl=... so we can bounce back to the booking flow. */
  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') || '/my/appointments';
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Please fill in all required fields correctly.';
      return;
    }
    this.loading = true;
    this.error = '';
    const v = this.form.value as any;
    this.auth.clientRegister(v).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: err => {
        if (err.status === 0) {
          this.error = 'Unable to reach the server. Please check your connection.';
        } else if (err.status === 409) {
          this.error = 'An account with that email already exists. Please sign in instead.';
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
}
