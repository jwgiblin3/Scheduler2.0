import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Provider } from '../../core/models/models';

@Component({
  selector: 'app-providers-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './providers-list.component.html',
  styleUrl: './providers-list.component.scss'
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
