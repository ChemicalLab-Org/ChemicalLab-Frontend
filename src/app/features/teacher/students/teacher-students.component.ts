import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  ApiError,
  CreateStudentRequest,
  StudentResponse,
  UpdateStudentRequest,
} from '../../../shared/models';
import {
  INSTITUTIONAL_IDENTIFIER_PATTERN,
  PERSON_NAME_PATTERN,
  normalizePersonName,
  normalizeStudentCode,
  sanitizeInstitutionalIdentifierInput,
  sanitizePersonNameInput,
} from '../../../shared/utils/institutional-input.util';

type FormMode = 'create' | 'edit';
type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-teacher-students',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-students.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="userRole"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <header class="page-header">
          <div>
            <h1 class="page-title">Mis estudiantes</h1>
            <p class="page-description">Gestiona el registro y los accesos de tu clase.</p>
          </div>
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons">add</span>
            Registrar estudiante
          </button>
        </header>

        @if (successMessage()) {
          <div class="alert alert-success page-alert">
            <span class="material-icons">check_circle</span>
            {{ successMessage() }}
          </div>
        }

        <!-- Toolbar de búsqueda y filtros -->
        <div class="toolbar">
          <div class="input-group toolbar__search">
            <span class="material-icons input-group__icon">search</span>
            <input
              class="input"
              type="search"
              placeholder="Buscar por nombre, apellido o código…"
              [value]="searchTerm()"
              (input)="onSearch($event)"
            />
          </div>

          <div class="toolbar__filters">
            <select class="select toolbar__select" [value]="gradeFilter()" (change)="onGradeFilter($event)">
              <option value="">Todos los grados</option>
              @for (g of grades(); track g) {
                <option [value]="g">{{ g }}°</option>
              }
            </select>

            <select class="select toolbar__select" [value]="sectionFilter()" (change)="onSectionFilter($event)">
              <option value="">Todas las secciones</option>
              @for (s of sections(); track s) {
                <option [value]="s">Sección {{ s }}</option>
              }
            </select>

            <select class="select toolbar__select" [value]="statusFilter()" (change)="onStatusFilter($event)">
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </div>

        <!-- Estados de carga / error / vacío / tabla -->
        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando estudiantes…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar los estudiantes</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadStudents()">Reintentar</button>
          </div>
        } @else if (students().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">group</span></div>
            <h2 class="empty-state__title">Aún no tienes estudiantes</h2>
            <p class="empty-state__desc">Registra a tu primer estudiante para empezar a gestionar tu clase.</p>
            <button type="button" class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons">add</span>
              Registrar estudiante
            </button>
          </div>
        } @else {
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Código</th>
                  <th>Grado</th>
                  <th>Sección</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (s of filteredStudents(); track s.id) {
                  <tr>
                    <td>
                      <div class="student-cell">
                        <div class="student-cell__avatar">{{ initials(s) }}</div>
                        <div class="student-cell__name">{{ s.names }} {{ s.lastNames }}</div>
                      </div>
                    </td>
                    <td class="text-mono code-cell">{{ s.studentCode }}</td>
                    <td>{{ s.grade }}°</td>
                    <td><span class="badge badge-neutral">{{ s.section }}</span></td>
                    <td>
                      @if (s.active) {
                        <span class="badge badge-success"><span class="status-dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="status-dot"></span>Inactivo</span>
                      }
                    </td>
                    <td>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="row-action"
                          title="Editar"
                          aria-label="Editar"
                          (click)="openEdit(s)"
                        >
                          <span class="material-icons">edit</span>
                        </button>
                        <button
                          type="button"
                          class="row-action row-action--danger"
                          title="Desactivar"
                          aria-label="Desactivar"
                          [disabled]="!s.active"
                          (click)="askDeactivate(s)"
                        >
                          <span class="material-icons">power_settings_new</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="table__empty">
                      Ningún estudiante coincide con la búsqueda o los filtros.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="table-summary">
            Mostrando <strong>{{ filteredStudents().length }}</strong> de
            <strong>{{ students().length }}</strong> estudiantes
          </div>
        }
      </main>
    </div>

    <!-- Modal: formulario crear / editar -->
    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">
              {{ formMode() === 'edit' ? 'Editar estudiante' : 'Registrar estudiante' }}
            </h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitForm()" class="modal__body">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="names">Nombres</label>
                <input id="names" class="input" formControlName="names" placeholder="ej. Ana Lucía"
                  maxlength="100" (input)="onPersonNameInput($event, 'names')"
                  [class.input-error]="isInvalid('names')" />
                @if (isInvalid('names')) {
                  <span class="form-error">Usa solo letras, espacios, apóstrofes o guiones (máx. 100).</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="lastNames">Apellidos</label>
                <input id="lastNames" class="input" formControlName="lastNames" placeholder="ej. Mendoza"
                  maxlength="100" (input)="onPersonNameInput($event, 'lastNames')"
                  [class.input-error]="isInvalid('lastNames')" />
                @if (isInvalid('lastNames')) {
                  <span class="form-error">Usa solo letras, espacios, apóstrofes o guiones (máx. 100).</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="studentCode">
                  Código {{ formMode() === 'create' ? '(opcional)' : '' }}
                </label>
                <input id="studentCode" class="input text-mono" formControlName="studentCode"
                  minlength="4" maxlength="20" (input)="onStudentCodeInput($event)"
                  [placeholder]="formMode() === 'create' ? 'Se genera automáticamente' : ''"
                  [class.input-error]="isInvalid('studentCode')" />
                @if (isInvalid('studentCode')) {
                  <span class="form-error">Usa entre 4 y 20 letras o números, sin espacios ni símbolos.</span>
                }
                @if (formMode() === 'create') {
                  <span class="form-hint">Si lo dejas vacío, el sistema generará un código.</span>
                }
              </div>

              @if (formMode() === 'create') {
                <div class="form-group">
                  <label class="form-label" for="temporaryPassword">Contraseña temporal</label>
                  <input id="temporaryPassword" class="input" formControlName="temporaryPassword"
                    placeholder="Mín. 6 caracteres" [class.input-error]="isInvalid('temporaryPassword')" />
                  @if (isInvalid('temporaryPassword')) {
                    <span class="form-error">La contraseña debe tener entre 6 y 100 caracteres.</span>
                  }
                </div>
              }

              <div class="form-group">
                <label class="form-label" for="grade">Grado</label>
                <select id="grade" class="select" formControlName="grade" [class.input-error]="isInvalid('grade')">
                  @for (g of gradeOptions; track g) {
                    <option [value]="g">{{ g }}° de secundaria</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="section">Sección</label>
                <select id="section" class="select" formControlName="section" [class.input-error]="isInvalid('section')">
                  @for (s of sectionOptions; track s) {
                    <option [value]="s">Sección {{ s }}</option>
                  }
                </select>
              </div>

              @if (formMode() === 'edit') {
                <div class="form-group form-group--full">
                  <label class="form-label">Estado</label>
                  <label class="toggle-row">
                    <input type="checkbox" formControlName="active" />
                    <span class="toggle-row__text">
                      {{ form.controls['active'].value ? 'Activo' : 'Inactivo' }} —
                      el estudiante {{ form.controls['active'].value ? 'puede' : 'no puede' }} iniciar sesión.
                    </span>
                  </label>
                </div>
              }
            </div>

            @if (formMode() === 'create') {
              <div class="alert alert-info modal__note">
                <span class="material-icons">info</span>
                El estudiante deberá cambiar su contraseña en el primer ingreso.
              </div>
            }

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Guardando…' : (formMode() === 'edit' ? 'Guardar cambios' : 'Guardar estudiante') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: confirmación de desactivación -->
    @if (deactivateTarget(); as target) {
      <div class="modal-overlay" (click)="cancelDeactivate()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">warning</span></div>
          <h2 class="modal__title">¿Desactivar a {{ target.names }} {{ target.lastNames }}?</h2>
          <p class="modal__text">
            El estudiante no podrá iniciar sesión. Su información se conservará y podrás reactivarlo
            cuando lo necesites editando sus datos.
          </p>
          @if (formError()) {
            <div class="alert alert-danger modal__note">
              <span class="material-icons">error_outline</span>
              {{ formError() }}
            </div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivate()" [disabled]="deactivating()">
              Cancelar
            </button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivate()" [disabled]="deactivating()">
              {{ deactivating() ? 'Desactivando…' : 'Confirmar desactivación' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherStudentsComponent {
  private readonly authService = inject(AuthService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly userRole = 'Docente';
  readonly gradeOptions = ['1', '2', '3', '4', '5'];
  readonly sectionOptions = ['A', 'B', 'C', 'D'];

  // Estado de datos
  readonly students = signal<StudentResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Búsqueda y filtros locales
  readonly searchTerm = signal<string>('');
  readonly gradeFilter = signal<string>('');
  readonly sectionFilter = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('all');

  // Formulario crear / editar
  readonly formOpen = signal<boolean>(false);
  readonly formMode = signal<FormMode>('create');
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);
  private readonly editingId = signal<number | null>(null);

  // Desactivación
  readonly deactivateTarget = signal<StudentResponse | null>(null);
  readonly deactivating = signal<boolean>(false);

  readonly form: FormGroup = this.fb.group({
    names: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(PERSON_NAME_PATTERN)],
    ],
    lastNames: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(PERSON_NAME_PATTERN)],
    ],
    studentCode: [
      '',
      [
        Validators.minLength(4),
        Validators.maxLength(20),
        Validators.pattern(INSTITUTIONAL_IDENTIFIER_PATTERN),
      ],
    ],
    temporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
    grade: ['1', [Validators.required]],
    section: ['A', [Validators.required]],
    active: [true],
  });

  // Usuario autenticado
  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));
  private readonly teacherUserId = computed<number | null>(() => this.currentUser()?.userId ?? null);

  // Opciones de filtro derivadas de los datos
  readonly grades = computed<string[]>(() =>
    [...new Set(this.students().map((s) => s.grade))].sort()
  );
  readonly sections = computed<string[]>(() =>
    [...new Set(this.students().map((s) => s.section))].sort()
  );

  readonly filteredStudents = computed<StudentResponse[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const grade = this.gradeFilter();
    const section = this.sectionFilter();
    const status = this.statusFilter();

    return this.students().filter((s) => {
      const matchesTerm =
        term === '' ||
        `${s.names} ${s.lastNames}`.toLowerCase().includes(term) ||
        s.studentCode.toLowerCase().includes(term);
      const matchesGrade = grade === '' || s.grade === grade;
      const matchesSection = section === '' || s.section === section;
      const matchesStatus =
        status === 'all' || (status === 'active' ? s.active : !s.active);
      return matchesTerm && matchesGrade && matchesSection && matchesStatus;
    });
  });

  constructor() {
    this.loadStudents();
  }

  loadStudents(): void {
    const teacherId = this.teacherUserId();
    if (teacherId === null) {
      this.error.set('No se pudo identificar al docente autenticado. Vuelve a iniciar sesión.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.userManagementService.listStudentsByTeacher(teacherId).subscribe({
      next: (students) => {
        this.students.set(students);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar los estudiantes.'));
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  onGradeFilter(event: Event): void {
    this.gradeFilter.set((event.target as HTMLSelectElement).value);
  }

  onSectionFilter(event: Event): void {
    this.sectionFilter.set((event.target as HTMLSelectElement).value);
  }

  onStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as StatusFilter);
  }

  onPersonNameInput(event: Event, controlName: 'names' | 'lastNames'): void {
    this.applySanitizedValue(event, controlName, sanitizePersonNameInput);
  }

  onStudentCodeInput(event: Event): void {
    this.applySanitizedValue(
      event,
      'studentCode',
      (value) => sanitizeInstitutionalIdentifierInput(value).toUpperCase()
    );
  }

  openCreate(): void {
    this.formMode.set('create');
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      names: '',
      lastNames: '',
      studentCode: '',
      temporaryPassword: '',
      grade: '1',
      section: 'A',
      active: true,
    });
    this.form.controls['temporaryPassword'].enable();
    this.formOpen.set(true);
  }

  openEdit(student: StudentResponse): void {
    this.formMode.set('edit');
    this.editingId.set(student.id);
    this.formError.set(null);
    this.form.reset({
      names: student.names,
      lastNames: student.lastNames,
      studentCode: student.studentCode,
      temporaryPassword: '',
      grade: student.grade,
      section: student.section,
      active: student.active,
    });
    // En edición no se cambia la contraseña: el campo no aplica.
    this.form.controls['temporaryPassword'].disable();
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  submitForm(): void {
    const teacherId = this.teacherUserId();
    if (teacherId === null) {
      this.formError.set('No se pudo identificar al docente autenticado.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const code = normalizeStudentCode(raw.studentCode ?? '');

    if (this.formMode() === 'create') {
      const request: CreateStudentRequest = {
        names: normalizePersonName(raw.names),
        lastNames: normalizePersonName(raw.lastNames),
        temporaryPassword: raw.temporaryPassword,
        grade: raw.grade,
        section: raw.section,
        ...(code !== '' ? { studentCode: code } : {}),
      };
      this.userManagementService.createStudent(teacherId, request).subscribe({
        next: () => this.onSaveSuccess('Estudiante registrado correctamente.'),
        error: (err: unknown) =>
          this.onSaveError(err, 'No se pudo registrar el estudiante.'),
      });
    } else {
      const id = this.editingId();
      if (id === null) {
        this.saving.set(false);
        return;
      }
      const request: UpdateStudentRequest = {
        names: normalizePersonName(raw.names),
        lastNames: normalizePersonName(raw.lastNames),
        grade: raw.grade,
        section: raw.section,
        active: raw.active,
        ...(code !== '' ? { studentCode: code } : {}),
      };
      this.userManagementService.updateStudent(teacherId, id, request).subscribe({
        next: () => this.onSaveSuccess('Estudiante actualizado correctamente.'),
        error: (err: unknown) =>
          this.onSaveError(err, 'No se pudo actualizar el estudiante.'),
      });
    }
  }

  private applySanitizedValue(
    event: Event,
    controlName: 'names' | 'lastNames' | 'studentCode',
    sanitizer: (value: string) => string
  ): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizer(input.value);
    if (sanitized === input.value) {
      return;
    }
    input.value = sanitized;
    this.form.controls[controlName].setValue(sanitized);
  }

  askDeactivate(student: StudentResponse): void {
    this.formError.set(null);
    this.deactivateTarget.set(student);
  }

  cancelDeactivate(): void {
    this.deactivateTarget.set(null);
    this.formError.set(null);
  }

  confirmDeactivate(): void {
    const teacherId = this.teacherUserId();
    const target = this.deactivateTarget();
    if (teacherId === null || target === null) {
      return;
    }

    this.deactivating.set(true);
    this.formError.set(null);
    this.userManagementService.deactivateStudent(teacherId, target.id).subscribe({
      next: () => {
        this.deactivating.set(false);
        this.deactivateTarget.set(null);
        this.flashSuccess(`${target.names} ${target.lastNames} fue desactivado.`);
        this.loadStudents();
      },
      error: (err: unknown) => {
        this.deactivating.set(false);
        this.formError.set(this.extractError(err, 'No se pudo desactivar el estudiante.'));
      },
    });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  initials(student: StudentResponse): string {
    return buildInitials(`${student.names} ${student.lastNames}`);
  }

  private onSaveSuccess(message: string): void {
    this.saving.set(false);
    this.formOpen.set(false);
    this.flashSuccess(message);
    this.loadStudents();
  }

  private onSaveError(err: unknown, fallback: string): void {
    this.saving.set(false);
    this.formError.set(this.extractError(err, fallback));
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | null;
      if (apiError?.message) {
        return apiError.message;
      }
      if (err.status === 0) {
        return 'No se pudo conectar con el servidor.';
      }
    }
    return fallback;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
