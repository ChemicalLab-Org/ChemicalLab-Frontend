import { Routes } from '@angular/router';
import { authGuard, temporaryPasswordGuard, roleGuard } from './core/guards';
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
import { TeacherManagementComponent } from './features/admin/teachers/teacher-management.component';
import { PeriodicTableComponent } from './features/periodic-table/periodic-table.component';
import { CompoundsComponent } from './features/compounds/compounds.component';
import { ConceptsComponent } from './features/concepts/concepts.component';
import { StudentEvaluationsComponent } from './features/student/evaluations/student-evaluations.component';

export const routes: Routes = [
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },

  { path: 'auth/login', component: LoginComponent },
  {
    path: 'auth/change-password',
    component: ChangePasswordComponent,
    canActivate: [authGuard],
  },
  { path: 'auth/access-denied', component: AccessDeniedComponent },

  {
    path: 'dashboard',
    component: RoleRedirectComponent,
    canActivate: [authGuard],
  },

  {
    path: 'student-dashboard',
    component: StudentDashboardComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
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
    path: 'periodic-table',
    component: PeriodicTableComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ESTUDIANTE', 'DOCENTE', 'ADMINISTRADOR'] },
  },
  {
    path: 'compounds',
    component: CompoundsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ESTUDIANTE', 'DOCENTE', 'ADMINISTRADOR'] },
  },
  {
    path: 'concepts',
    component: ConceptsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
  },
  {
    path: 'evaluations',
    component: StudentEvaluationsComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
  },

  { path: '**', redirectTo: 'auth/login' },
];
