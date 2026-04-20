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

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    practiceName: ['', Validators.required],
    practiceSlug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]]
  });

  loading = false;
  error = '';

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Please fill in all required fields correctly.';
      return;
    }
    this.loading = true;
    this.error = '';
    const v = this.form.value as any;
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
}
