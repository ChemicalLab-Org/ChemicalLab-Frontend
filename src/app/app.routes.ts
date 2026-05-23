import { Routes } from '@angular/router';
import { authGuard, temporaryPasswordGuard, roleGuard } from './core/guards';
import { LoginComponent } from './features/auth/login/login.component';
import { ChangePasswordComponent } from './features/auth/change-password/change-password.component';
import { AccessDeniedComponent } from './features/auth/access-denied/access-denied.component';
import { RoleRedirectComponent } from './features/auth/role-redirect/role-redirect.component';
import { StudentDashboardComponent } from './features/student-dashboard/student-dashboard.component';
import { TeacherDashboardComponent } from './features/teacher-dashboard/teacher-dashboard.component';
import { AdminDashboardComponent } from './features/admin-dashboard/admin-dashboard.component';

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
    path: 'admin-dashboard',
    component: AdminDashboardComponent,
    canActivate: [authGuard, temporaryPasswordGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
  },

  { path: '**', redirectTo: 'auth/login' },
];
