import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Provider } from '../../core/models/models';

@Component({
  selector: 'app-providers-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Providers</h1>
        <a routerLink="/providers/new" class="btn btn-primary">+ Add Provider</a>
      </div>

      @if (loading()) {
        <div class="loading">Loading...</div>
      } @else if (providers().length === 0) {
        <div class="empty-state">
          <p>No providers yet. <a routerLink="/providers/new">Add your first provider.</a></p>
        </div>
      } @else {
        <div class="providers-grid">
          @for (p of providers(); track p.id) {
            <div class="provider-card">
              <div class="provider-avatar">{{ p.firstName[0] }}{{ p.lastName[0] }}</div>
              <div class="provider-info">
                <div class="provider-name">{{ p.firstName }} {{ p.lastName }}</div>
                <div class="provider-email">{{ p.email }}</div>
                @if (p.bio) { <div class="provider-bio">{{ p.bio }}</div> }
              </div>
              <div class="provider-meta">
                <span class="badge" [class.badge-green]="p.isActive" [class.badge-gray]="!p.isActive">
                  {{ p.isActive ? 'Active' : 'Inactive' }}
                </span>
                <div class="avail-count">{{ p.availabilities.length }} availability blocks</div>
              </div>
              <div class="provider-actions">
                <a [routerLink]="['/providers', p.id, 'edit']" class="btn btn-sm">Edit</a>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.6rem; color: #1a1f36; }
    .btn { text-decoration: none; padding: .5rem 1rem; border-radius: 6px; font-size: .85rem; cursor: pointer; display: inline-block; }
    .btn-primary { background: #667eea; color: #fff; border: none; }
    .btn-sm { border: 1.5px solid #e2e8f0; color: #4a5568; font-size: .8rem; padding: .3rem .75rem; }
    .loading { color: #718096; }
    .empty-state { color: #718096; }
    .empty-state a { color: #667eea; text-decoration: none; }
    .providers-grid { display: flex; flex-direction: column; gap: 1rem; }
    .provider-card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); display: flex; align-items: center; gap: 1rem; }
    .provider-avatar { width: 48px; height: 48px; border-radius: 50%; background: #667eea; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
    .provider-info { flex: 1; }
    .provider-name { font-weight: 600; }
    .provider-email { font-size: .8rem; color: #718096; margin-top: 2px; }
    .provider-bio { font-size: .8rem; color: #4a5568; margin-top: 4px; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .provider-meta { text-align: right; }
    .avail-count { font-size: .75rem; color: #a0aec0; margin-top: 4px; }
    .badge { font-size: .75rem; padding: 2px 8px; border-radius: 12px; }
    .badge-green { background: #f0fff4; color: #276749; }
    .badge-gray { background: #f7f8fc; color: #718096; }
  `]
})
export class ProvidersListComponent implements OnInit {
  private api = inject(ApiService);
  loading = signal(true);
  providers = signal<Provider[]>([]);

  ngOnInit() {
    this.api.getProviders().subscribe({
      next: data => { this.providers.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
