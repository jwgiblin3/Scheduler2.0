import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  // maxLength on email matches server cap (RFC 5321 — 254). Password has
  // no max here; server enforces what it enforces.
  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', Validators.required]
  });

  loading = false;
  error = '';

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password } = this.form.value;
    this.auth.login({ email: email!, password: password! }).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: () => {
        // ?returnUrl= wins (e.g. booking flow bounced us here); otherwise
        // fall back to the role-aware post-login route.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl || this.auth.postLoginRoute());
      },
      error: err => {
        if (err.status === 401) {
          this.error = 'Invalid email or password.';
        } else if (err.status === 0) {
          this.error = 'Unable to reach the server. Please check your connection.';
        } else if (typeof err.error === 'string' && err.error.trim()) {
          this.error = err.error;
        } else if (err.error?.message) {
          this.error = err.error.message;
        } else {
          this.error = 'Something went wrong. Please try again.';
        }
      }
    });
  }
}
