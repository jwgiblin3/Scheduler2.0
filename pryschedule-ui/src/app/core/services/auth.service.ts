import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AuthResponse, ClientRegisterRequest, CreatePracticeRequest,
  LoginRequest, RegisterRequest
} from '../models/models';

const TOKEN_KEY = 'ps_token';
const USER_KEY = 'ps_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  currentUser = signal<AuthResponse | null>(this.loadUser());

  /** Reactive helpers derived from currentUser() */
  hasPractice = computed(() => !!this.currentUser()?.practiceId);
  hasClientAppointments = computed(() => !!this.currentUser()?.hasClientAppointments);

  constructor(private http: HttpClient, private router: Router) {}

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, req).pipe(
      tap(res => this.setSession(res))
    );
  }

  /** Practice-owner registration (creates a new practice + admin account). */
  register(req: RegisterRequest) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, req).pipe(
      tap(res => this.setSession(res))
    );
  }

  /** Client-only registration (no practice, used on the booking flow). */
  clientRegister(req: ClientRegisterRequest) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/client-register`, req).pipe(
      tap(res => this.setSession(res))
    );
  }

  /**
   * Creates a new Practice for the signed-in account. Requires an existing
   * auth session (the JWT identifies the caller). The response carries a
   * fresh token with the new practiceId claim baked in — we replace the
   * cached session so subsequent requests are immediately scoped to the
   * new practice.
   */
  createPractice(req: CreatePracticeRequest) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/create-practice`, req).pipe(
      tap(res => this.setSession(res))
    );
  }

  /**
   * Sign out and navigate to /login. If `returnUrl` is provided, it is passed
   * through as a query param so the next sign-in resumes on that page.
   * (Useful when the user is mid-booking and clicks "not you" — they should
   * land back on the booking page after signing in again.)
   */
  logout(options?: { returnUrl?: string }) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    const returnUrl = options?.returnUrl;
    if (returnUrl) {
      this.router.navigate(['/login'], { queryParams: { returnUrl } });
    } else {
      this.router.navigate(['/login']);
    }
  }

  /** Patch the cached user (e.g. after booking, set hasClientAppointments=true). */
  patchUser(patch: Partial<AuthResponse>) {
    const cur = this.currentUser();
    if (!cur) return;
    const next = { ...cur, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.currentUser.set(next);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'Admin';
  }

  isClient(): boolean {
    return this.currentUser()?.role === 'Client';
  }

  /**
   * Platform-level operator. Distinct from a practice Admin: a SuperAdmin
   * has no PracticeId and operates above tenants. Used to gate the /admin
   * console (global form templates, cross-tenant browse).
   */
  isSuperAdmin(): boolean {
    return this.currentUser()?.role === 'SuperAdmin';
  }

  /**
   * Where to send the user right after sign-in.
   * - SuperAdmin lands on /admin (the platform console).
   * - Admin who also has client appointments lands on /home (the chooser).
   * - Plain practice admin goes to /dashboard.
   * - Pure client goes to /my/appointments.
   */
  postLoginRoute(): string {
    const u = this.currentUser();
    if (!u) return '/login';
    if (u.role === 'SuperAdmin') return '/admin';
    const hasPractice = !!u.practiceId;
    const hasAppts = !!u.hasClientAppointments;
    if (hasPractice && hasAppts) return '/home';
    if (hasPractice) return '/dashboard';
    return '/my/appointments';
  }

  private setSession(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res));
    this.currentUser.set(res);
  }

  private loadUser(): AuthResponse | null {
    const json = localStorage.getItem(USER_KEY);
    return json ? JSON.parse(json) : null;
  }
}
