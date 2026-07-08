import { Routes } from '@angular/router';
import { authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard } from './core/guards';
import { LoginComponent } from './features/auth/login/login.component';
import { ChangePasswordComponent } from './features/auth/change-password/change-password.component';
import { AccessDeniedComponent } from './features/auth/access-denied/access-denied.component';
import { RoleRedirectComponent } from './features/auth/role-redirect/role-redirect.component';
import { StudentDashboardComponent } from './features/student-dashboard/student-dashboard.component';
import { TeacherDashboardComponent } from './features/teacher-dashboard/teacher-dashboard.component';
import { AdminDashboardComponent } from './features/admin-dashboard/admin-dashboard.component';
import { TeacherStudentsComponent } from './features/teacher/students/teacher-students.component';
import { TeacherPasswordsComponent } from './features/teacher/passwords/teacher-passwords.component';
import { TeacherConceptsComponent } from './features/teacher/concepts/teacher-concepts.component';
import { TeacherEvaluationsComponent } from './features/teacher/evaluations/teacher-evaluations.component';
import { TeacherEvaluationResultsComponent } from './features/teacher/evaluations/teacher-evaluation-results.component';
import { TeacherResultsComponent } from './features/teacher/evaluations/teacher-results.component';
import { TeacherManagementComponent } from './features/admin/teachers/teacher-management.component';
import { AdminUsersComponent } from './features/admin/users/admin-users.component';
import { SystemStatusComponent } from './features/admin/system-status/system-status.component';
import { AdminLogsComponent } from './features/admin/logs/admin-logs.component';
import { UsageMetricsComponent } from './features/admin/usage-metrics/usage-metrics.component';
import { AcademicSupervisionComponent } from './features/admin/academic-supervision/academic-supervision.component';
import { PeriodicTableComponent } from './features/periodic-table/periodic-table.component';
import { CompoundsComponent } from './features/compounds/compounds.component';
import { ConceptsComponent } from './features/concepts/concepts.component';
import { StudentEvaluationsComponent } from './features/student/evaluations/student-evaluations.component';
import { StudentResultsComponent } from './features/student/evaluations/student-results.component';
import { NotFoundComponent } from './features/not-found/not-found.component';

export const routes: Routes = [
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },

  { path: 'auth/login', component: LoginComponent },
  {
    path: 'auth/change-password',
    component: ChangePasswordComponent,
    canActivate: [authGuard],
  },
  { path: 'auth/access-denied', component: AccessDeniedComponent },
  { path: 'forbidden', component: AccessDeniedComponent },
  { path: 'not-found', component: NotFoundComponent },

  {
    path: 'dashboard',
    component: RoleRedirectComponent,
    canActivate: [authGuard],
  },

  {
    path: 'student-dashboard',
    component: StudentDashboardComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'teacher-dashboard',
    component: TeacherDashboardComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/students',
    component: TeacherStudentsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/passwords',
    component: TeacherPasswordsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/concepts',
    component: TeacherConceptsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/evaluations',
    component: TeacherEvaluationsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/results',
    component: TeacherResultsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    // Carga diferida: el editor en vivo arrastra la dependencia WebSocket/STOMP, que se
    // mantiene fuera del bundle inicial y solo se descarga al abrir el módulo de pizarra.
    path: 'teacher/whiteboards',
    loadComponent: () =>
      import('./features/teacher/whiteboards/teacher-whiteboards.component').then(
        (m) => m.TeacherWhiteboardsComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/whiteboards/:id',
    loadComponent: () =>
      import('./features/teacher/whiteboards/teacher-whiteboard-editor.component').then(
        (m) => m.TeacherWhiteboardEditorComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/results/:evaluationId',
    component: TeacherEvaluationResultsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'teacher/evaluations/:evaluationId/results',
    component: TeacherEvaluationResultsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['DOCENTE'] },
  },
  {
    path: 'admin-dashboard',
    component: AdminDashboardComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/teachers',
    component: TeacherManagementComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/users',
    component: AdminUsersComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/academic-supervision',
    component: AcademicSupervisionComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/system-status',
    component: SystemStatusComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/logs',
    component: AdminLogsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'admin/usage-metrics',
    component: UsageMetricsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    // Carga diferida: mantiene el registro de uso por estudiante fuera del bundle inicial;
    // solo se descarga cuando el administrador abre el módulo.
    path: 'admin/student-usage-records',
    loadComponent: () =>
      import('./features/admin/student-usage/student-usage-records.component').then(
        (m) => m.StudentUsageRecordsComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },
  {
    path: 'periodic-table',
    component: PeriodicTableComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE', 'DOCENTE', 'ADMINISTRADOR'] },
  },
  {
    path: 'compounds',
    component: CompoundsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE', 'DOCENTE', 'ADMINISTRADOR'] },
  },
  {
    path: 'concepts',
    component: ConceptsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'evaluations',
    component: StudentEvaluationsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'evaluations/results',
    component: StudentResultsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    // Carga diferida: el visor en vivo arrastra la dependencia WebSocket/STOMP, que se mantiene
    // fuera del bundle inicial (igual que el editor docente). Las tres pantallas del estudiante
    // se cargan bajo demanda al abrir el módulo de pizarra.
    path: 'student/whiteboards',
    loadComponent: () =>
      import('./features/student/whiteboards/student-whiteboards.component').then(
        (m) => m.StudentWhiteboardsComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'student/whiteboards/:id',
    loadComponent: () =>
      import('./features/student/whiteboards/student-whiteboard-viewer.component').then(
        (m) => m.StudentWhiteboardViewerComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'student/whiteboards/:id/registro',
    loadComponent: () =>
      import('./features/student/whiteboards/student-whiteboard-record.component').then(
        (m) => m.StudentWhiteboardRecordComponent
      ),
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard, examActiveGuard],
    data: { roles: ['ESTUDIANTE'] },
  },

  { path: '**', component: NotFoundComponent },
];
