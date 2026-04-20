import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Provider } from '../../core/models/models';

@Component({
  selector: 'app-providers-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './providers-list.component.html',
  styleUrls: ['./providers-list.component.scss']
})
export class ProvidersListComponent implements OnInit {
  private api = inject(ApiService);
  loading = signal(true);
  providers = signal<Provider[]>([]);

  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  ngOnInit() {
    this.api.getProviders().subscribe({
      next: data => { this.providers.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
