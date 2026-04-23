import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BookingInfo } from '../../core/models/models';
import { BookingWidgetComponent } from '../../widgets/booking-widget/booking-widget.component';

/**
 * Hosted booking page — provides the header chrome around the reusable
 * BookingWidgetComponent. The widget carries all booking state and logic;
 * this page owns the surrounding layout and per-practice branding.
 *
 * The same widget is mounted without this chrome at /widget/book/:slug for
 * iframe embedding on third-party sites.
 */
@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [RouterLink, BookingWidgetComponent],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss']
})
export class BookingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  auth = inject(AuthService);

  /** Practice branding — populated after the public practice lookup resolves. */
  practice = signal<BookingInfo | null>(null);

  /** Banner color with a sensible fallback so the header is never see-through. */
  bannerColor = computed(() => this.practice()?.bannerColor || '#1a1f36');
  /** Logo URL if set; otherwise null and the header falls back to the name. */
  logoUrl = computed(() => this.practice()?.logoUrl || null);
  /** Practice display name — "ProSchedule" only while the lookup is in flight. */
  displayName = computed(() => this.practice()?.name || 'ProSchedule');
  /** Website link to surface in the header (external, so use href). */
  website = computed(() => this.practice()?.website || null);
  /**
   * Formatted "123 Main St · City, ST 12345" address string for the header.
   * Returns null when the practice hasn't entered any address fields, so the
   * header can hide the row entirely instead of showing stray punctuation.
   */
  addressLine = computed(() => {
    const p = this.practice();
    if (!p) return null;
    const line1 = (p.addressLine1 ?? '').trim();
    const city = (p.city ?? '').trim();
    const state = (p.state ?? '').trim();
    const zip = (p.postalCode ?? '').trim();
    const cityStateZip = [
      city,
      [state, zip].filter(s => s.length > 0).join(' ').trim()
    ].filter(s => s.length > 0).join(', ');
    const parts = [line1, cityStateZip].filter(s => s.length > 0);
    return parts.length === 0 ? null : parts.join(' · ');
  });

  get slug(): string { return this.route.snapshot.paramMap.get('slug') ?? ''; }

  /** Where to send the user back to after sign-in / registration. */
  returnUrl(): string { return `/book/${this.slug}`; }

  ngOnInit() {
    if (!this.slug) return;
    // Duplicates the widget's fetch, but the widget owns its own lifecycle and
    // we want the header to render as soon as the practice is known. Both
    // calls hit a cached, public endpoint, so the extra request is cheap.
    this.api.getPublicPractice(this.slug).subscribe({
      next: data => this.practice.set(data),
      error: () => { /* silent — widget surfaces the error */ }
    });
  }
}
