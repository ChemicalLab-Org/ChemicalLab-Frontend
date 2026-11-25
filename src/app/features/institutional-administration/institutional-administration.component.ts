import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, finalize, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';

type View = 'summary' | 'PERIODS' | 'CLASSES' | 'MEMBERS' | 'ENROLLMENTS' | 'TEACHING' |
  'FACULTIES' | 'activity' | 'audit';
type Lookup = 'PERIODS' | 'CLASSES' | 'MEMBERS' | 'RESOURCES';
type Value = string | number | boolean | null;
type Row = { id: number; name?: string } & Record<string, Value | undefined>;
interface Page { items: Row[]; nextAfter: number | null }
interface Access { adopted: boolean; enabled: boolean; platform: boolean }
interface Credentials { username: string; temporaryPassword: string }

@Component({
  selector: 'app-institutional-administration',
  imports: [FormsModule, RouterLink],
  templateUrl: './institutional-administration.component.html',
  styleUrl: './institutional-administration.component.scss',
})
export class InstitutionalAdministrationComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reload = new Subject<void>();
  private readonly root = environment.apiUrl;

  readonly sections: ReadonlyArray<{ key: View; label: string }> = [
    { key: 'summary', label: 'Resumen' },
    { key: 'PERIODS', label: 'Períodos' },
    { key: 'CLASSES', label: 'Clases' },
    { key: 'MEMBERS', label: 'Miembros' },
    { key: 'ENROLLMENTS', label: 'Matrículas' },
    { key: 'TEACHING', label: 'Docencia' },
    { key: 'FACULTIES', label: 'Biblioteca' },
    { key: 'activity', label: 'Actividad' },
    { key: 'audit', label: 'Auditoría' },
  ];
  readonly roles = ['ESTUDIANTE', 'DOCENTE', 'ADMIN_INSTITUCION'];
  readonly faculties = ['EDIT_DRAFT', 'PUBLISH', 'ASSIGN'];
  readonly columns: Record<View, ReadonlyArray<[string, string]>> = {
    summary: [['members', 'Miembros vigentes'], ['classes', 'Clases vigentes'], ['evaluations', 'Evaluaciones'],
      ['contents', 'Contenidos'], ['boards', 'Pizarras']],
    PERIODS: [['name', 'Período'], ['valid_from', 'Inicio'], ['valid_until', 'Fin'], ['open', 'Abierto']],
    CLASSES: [['name', 'Clase'], ['code', 'Código'], ['period', 'Período'], ['active', 'Abierta']],
    MEMBERS: [['name', 'Miembro'], ['state', 'Estado'], ['roles', 'Roles vigentes']],
    ENROLLMENTS: [['class_name', 'Clase'], ['membership_id', 'Miembro #'], ['valid_until', 'Fin previsto'], ['ended_at', 'Baja']],
    TEACHING: [['class_name', 'Clase'], ['membership_id', 'Miembro #'], ['faculty', 'Función'], ['valid_until', 'Fin previsto'], ['ended_at', 'Baja']],
    FACULTIES: [['resource_id', 'Recurso #'], ['membership_id', 'Miembro #'], ['faculty', 'Facultad'],
      ['valid_until', 'Fin previsto'], ['revoked_at', 'Revocación']],
    activity: [['source', 'Módulo'], ['action', 'Acción'], ['actor_membership_id', 'Actor #'],
      ['class_id', 'Clase #'], ['target_id', 'Recurso #'], ['created_at', 'Fecha']],
    audit: [['source', 'Módulo'], ['action', 'Acción'], ['actor_membership_id', 'Actor #'],
      ['subject_membership_id', 'Miembro #'], ['target_id', 'Registro #'], ['created_at', 'Fecha']],
  };
  readonly access = signal<Access | null>(null);
  readonly scopes = signal<Page>({ items: [], nextAfter: null });
  readonly page = signal<Page>({ items: [], nextAfter: null });
  readonly choices = signal<Partial<Record<Lookup, Page>>>({});
  readonly totals = signal<Record<string, Value>>({});
  readonly error = signal('');
  readonly credentials = signal<Credentials | null>(null);
  readonly writing = signal(false);
  readonly busy = signal(false);
  platform = false;
  institution: number | null = null;
  view: View = 'summary';
  library = 'EVALUATIONS';
  filterMember: number | null = null;
  editing = false;
  role = 'ESTUDIANTE';

  private get platformUrl(): string { return `${this.root}/platform/institutions/v1`; }
  private get scopeUrl(): string { return `${this.root}/institutions/${this.institution}/administration/v1`; }

  ngOnInit(): void {
    this.http.get<Access>(`${this.root}/institution-administration/v1/access`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: access => {
          this.access.set(access);
          if (access.enabled) this.mode(access.platform);
        },
        error: failure => this.report(failure),
      });
  }

  mode(platform: boolean): void {
    this.platform = platform;
    this.scopes.set({ items: [], nextAfter: null });
    this.changeScope(null);
    this.loadScopes();
  }

  loadScopes(after = 0): void {
    const url = this.platform ? this.platformUrl : `${this.root}/institution-administration/v1/institutions`;
    this.read(this.http.get<Page>(url, { params: { after } }), result => this.append(this.scopes, result, after));
  }

  changeScope(id: number | null): void {
    this.institution = id;
    this.changeView('summary');
  }

  changeView(view: View): void {
    this.reload.next();
    this.view = view;
    this.editing = false;
    this.filterMember = null;
    this.error.set('');
    this.credentials.set(null);
    this.resetRecords();
  }

  changeLibrary(library: string): void {
    this.library = library;
    this.changeView('FACULTIES');
  }

  resetRecords(): void {
    this.page.set({ items: [], nextAfter: null });
    this.totals.set({});
    this.choices.set({});
    if (this.institution !== null && !this.platform) this.loadRecords();
  }

  loadRecords(after = 0): void {
    let params = new HttpParams();
    const view = this.view;
    if (view === 'summary') {
      this.read(this.http.get<Record<string, Value>>(`${this.scopeUrl}/summary`), result => this.totals.set(result), true);
      return;
    }
    let url = `${this.scopeUrl}/records/${view}`;
    if (view === 'activity' || view === 'audit') {
      url = `${this.scopeUrl}/${view}`;
      params = params.set('before', after);
      if (this.filterMember !== null) params = params.set('member', this.filterMember);
    } else {
      params = params.set('after', after);
      if (view === 'FACULTIES') params = params.set('library', this.library);
    }
    this.read(this.http.get<Page>(url, { params }), result => this.append(this.page, result, after), true);
  }

  showForm(): void {
    this.editing = !this.editing;
    if (!this.editing || this.platform) return;
    if (this.view === 'CLASSES') this.lookup('PERIODS');
    if (this.view === 'TEACHING' || this.view === 'ENROLLMENTS') {
      this.lookup('CLASSES');
      this.lookup('MEMBERS');
    }
    if (this.view === 'FACULTIES') {
      this.lookup('RESOURCES');
      this.lookup('MEMBERS');
    }
  }

  lookup(section: Lookup, after = 0): void {
    if (!after && this.choices()[section]) return;
    let params = new HttpParams().set('after', after);
    if (section === 'RESOURCES') params = params.set('library', this.library);
    this.read(this.http.get<Page>(`${this.scopeUrl}/records/${section}`, { params }), result => {
      this.choices.update(current => ({ ...current, [section]: this.merge(current[section], result, after) }));
    });
  }

  submit(event: SubmitEvent): void {
    event.preventDefault();
    if (this.writing()) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const value = (field: string) => String(form.get(field) ?? '');
    const iso = (field: string) => new Date(value(field)).toISOString();
    const member = { username: value('username'), displayName: value('displayName') };
    let suffix = '';
    let body: object;
    if (this.platform) {
      suffix = this.institution === null ? '' : `/${this.institution}/first-administrator`;
      body = this.institution === null ? { name: value('name') } : member;
    } else {
      switch (this.view) {
        case 'PERIODS':
          suffix = '/periods';
          body = { name: value('name'), from: iso('from'), until: iso('until') };
          break;
        case 'CLASSES':
          suffix = '/classes';
          body = { name: value('name'), code: value('code'), periodId: Number(value('PERIODS')) };
          break;
        case 'MEMBERS':
          suffix = '/members';
          body = member;
          break;
        case 'ENROLLMENTS':
        case 'TEACHING':
          suffix = this.view === 'TEACHING' ? '/teaching' : '/enrollments';
          body = { classId: Number(value('CLASSES')), membershipId: Number(value('MEMBERS')), until: iso('until'),
            ...(this.view === 'TEACHING' ? { faculty: value('faculty') } : {}) };
          break;
        case 'FACULTIES':
          suffix = `/library/${this.library}/faculties`;
          body = { resourceId: Number(value('RESOURCES')), membershipId: Number(value('MEMBERS')),
            faculty: value('faculty'), until: iso('until') };
          break;
        default: return;
      }
    }
    const url = (this.platform ? this.platformUrl : this.scopeUrl) + suffix;
    this.write(this.http.post<Credentials | { id: number }>(url, body), result => {
      if ('temporaryPassword' in result) this.credentials.set(result);
      this.editing = false;
    });
  }

  selectFirstAdmin(id: number): void {
    this.changeScope(id);
    this.editing = true;
  }

  institutionName(): string | undefined {
    return this.scopes().items.find(row => row.id === this.institution)?.name;
  }

  institutionState(row: Row): void {
    this.write(this.http.patch(`${this.platformUrl}/${row.id}/state`, { active: !row['active'] }));
  }

  memberState(id: number, state: string): void {
    this.write(this.http.patch(`${this.scopeUrl}/members/${id}/state/${state}`, {}));
  }

  changeRole(row: Row): void {
    const url = `${this.scopeUrl}/members/${row.id}/roles/${this.role}`;
    this.write(this.hasRole(row) ? this.http.delete(url) : this.http.put(url, {}));
  }

  hasRole(row: Row): boolean {
    return typeof row['roles'] === 'string' && row['roles'].split(',').includes(this.role);
  }

  close(id: number): void {
    const resource = { PERIODS: 'periods', CLASSES: 'classes', ENROLLMENTS: 'enrollments', TEACHING: 'teaching' };
    if (this.view === 'FACULTIES') {
      this.write(this.http.delete(`${this.scopeUrl}/library/${this.library}/faculties/${id}`));
    } else if (this.view in resource) {
      const name = resource[this.view as keyof typeof resource];
      const action = this.view === 'PERIODS' || this.view === 'CLASSES' ? 'close' : 'end';
      this.write(this.http.patch(`${this.scopeUrl}/${name}/${id}/${action}`, {}));
    }
  }

  display(value: Value | undefined): Value {
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return value ?? '—';
  }

  lookups(): Lookup[] {
    switch (this.view) {
      case 'CLASSES': return ['PERIODS'];
      case 'TEACHING':
      case 'ENROLLMENTS': return ['CLASSES', 'MEMBERS'];
      case 'FACULTIES': return ['RESOURCES', 'MEMBERS'];
      default: return [];
    }
  }

  readonly lookupLabels: Record<Lookup, string> = {
    PERIODS: 'Período', CLASSES: 'Clase', MEMBERS: 'Miembro', RESOURCES: 'Recurso',
  };

  private merge(current: Page | undefined, result: Page, after: number): Page {
    return { items: after ? [...(current?.items ?? []), ...result.items] : result.items, nextAfter: result.nextAfter };
  }

  private append(destination: typeof this.page, result: Page, after: number): void {
    destination.update(current => this.merge(current, result, after));
  }

  private read<T>(request: Observable<T>, apply: (result: T) => void, showBusy = false): void {
    if (showBusy) this.busy.set(true);
    request.pipe(takeUntil(this.reload), takeUntilDestroyed(this.destroyRef),
        finalize(() => { if (showBusy) this.busy.set(false); }))
      .subscribe({ next: apply, error: failure => this.report(failure) });
  }

  private write<T>(request: Observable<T>, apply?: (result: T) => void): void {
    if (this.writing()) return;
    this.writing.set(true);
    this.error.set('');
    this.credentials.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.writing.set(false)))
      .subscribe({
        next: result => {
          apply?.(result);
          this.reload.next();
          if (this.platform) this.loadScopes();
          else this.resetRecords();
        },
        error: failure => this.report(failure),
      });
  }

  private report(failure: HttpErrorResponse): void {
    this.error.set(failure.error?.message ?? 'No se pudo completar la operación.');
    if (failure.status === 403) {
      this.page.set({ items: [], nextAfter: null });
      this.totals.set({});
      this.choices.set({});
      this.credentials.set(null);
      this.editing = false;
    }
  }
}
