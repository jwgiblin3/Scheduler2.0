import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
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
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const v = this.form.value as any;
    this.auth.register(v).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: err => {
        this.error = Array.isArray(err.error) ? err.error.join(', ') : (err.error || 'Registration failed.');
        this.loading = false;
      }
    });
  }
}
