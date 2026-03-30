import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">📅 ProSchedule</div>
        <h2>Sign in to your practice</h2>
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label>Email</label>
            <input type="email" formControlName="email" placeholder="you@practice.com" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" formControlName="password" placeholder="••••••••" />
          </div>
          @if (error) {
            <div class="alert-error">{{ error }}</div>
          }
          <button type="submit" class="btn-primary" [disabled]="loading">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>
        <p class="auth-footer">No account? <a routerLink="/register">Create one</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f7f8fc; }
    .auth-card { background: #fff; border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .auth-logo { font-size: 1.4rem; font-weight: 700; color: #1a1f36; margin-bottom: 1rem; }
    h2 { margin: 0 0 1.5rem; font-size: 1.1rem; color: #4a5568; font-weight: 400; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    input { width: 100%; padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    input:focus { outline: none; border-color: #667eea; }
    .btn-primary { width: 100%; padding: .75rem; background: #667eea; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: .5rem; }
    .btn-primary:hover:not(:disabled) { background: #5a67d8; }
    .btn-primary:disabled { opacity: .6; cursor: default; }
    .alert-error { background: #fff5f5; color: #c53030; padding: .6rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: .75rem; }
    .auth-footer { text-align: center; margin-top: 1.25rem; font-size: .85rem; color: #718096; }
    .auth-footer a { color: #667eea; text-decoration: none; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  loading = false;
  error = '';

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password } = this.form.value;
    this.auth.login({ email: email!, password: password! }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: err => {
        this.error = err.error || 'Login failed. Please try again.';
        this.loading = false;
      }
    });
  }
}
