import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface SidebarNavItem {
  readonly label: string;
  readonly icon: string;
  readonly route: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  styleUrls: ['./sidebar.component.scss'],
  template: `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">
          <span class="material-icons">science</span>
        </div>
        <div class="sidebar__brand-text">
          <div class="sidebar__brand-title">QuímicaLab</div>
          <div class="sidebar__brand-subtitle">Laboratorio Digital</div>
        </div>
      </div>

      <div class="sidebar__divider"></div>

      <nav class="sidebar__nav">
        @for (item of navItems; track item.route) {
          <a
            class="sidebar__nav-item"
            [class.sidebar__nav-item--active]="isActive(item.route)"
            [class.sidebar__nav-item--disabled]="item.disabled"
            [attr.href]="item.disabled ? null : item.route"
            [attr.title]="item.disabled ? 'Próximamente' : null"
            (click)="onNavClick($event, item.route, item.disabled)"
          >
            @if (isActive(item.route)) {
              <span class="sidebar__nav-indicator"></span>
            }
            <span class="material-icons sidebar__nav-icon">{{ item.icon }}</span>
            <span class="sidebar__nav-label">{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="sidebar__footer">
        <div class="sidebar__divider"></div>

        <div class="sidebar__user">
          <div class="sidebar__avatar">{{ userInitials }}</div>
          <div class="sidebar__user-info">
            <div class="sidebar__user-name">{{ userName }}</div>
            <div class="sidebar__user-role">{{ userRole }}</div>
          </div>
        </div>

        <button type="button" class="sidebar__logout" (click)="handleLogout()">
          <span class="material-icons sidebar__nav-icon">logout</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  @Input({ required: true }) navItems: readonly SidebarNavItem[] = [];
  @Input({ required: true }) userName = '';
  @Input({ required: true }) userRole = '';
  @Input({ required: true }) userInitials = '';

  @Output() readonly onLogout = new EventEmitter<void>();

  private readonly router = inject(Router);
  private readonly currentUrl = signal<string>(this.router.url);

  readonly activeUrl = computed(() => this.currentUrl());

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }

  isActive(route: string): boolean {
    const current = this.activeUrl();
    if (route === '/') {
      return current === '/' || current === '';
    }
    return current === route || current.startsWith(route + '/');
  }

  onNavClick(event: MouseEvent, route: string, disabled?: boolean): void {
    event.preventDefault();
    if (disabled) {
      return;
    }
    void this.router.navigateByUrl(route);
  }

  handleLogout(): void {
    this.onLogout.emit();
  }
}
