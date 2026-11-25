import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClassChoice, EvaluationView } from './catalog-api';
import { InstitutionalStudentComponent } from './institutional-student.component';
import { InstitutionalTeacherComponent } from './institutional-teacher.component';

@Component({
  selector: 'app-institutional-evaluations',
  imports: [RouterLink, InstitutionalStudentComponent, InstitutionalTeacherComponent],
  template: `
    <main class="institutional">
      <a routerLink="/dashboard">Volver al inicio</a>
      <h1>Evaluaciones institucionales</h1>
      <div class="controls">
        <label>Institución
          <select #school [value]="institution() ?? ''" (change)="chooseInstitution(school.value)">
            <option value="">Selecciona una institución</option>
            @for (item of institutions(); track item.institutionId) {
              <option [value]="item.institutionId">{{ item.institutionName }}</option>
            }
          </select>
        </label>
        <label>Clase
          <select #group [value]="selection()?.classId ?? ''" [disabled]="!institution()"
                  (change)="chooseClass(group.value)">
            <option value="">Selecciona una clase</option>
            @for (item of classOptions(); track item.classId) {
              <option [value]="item.classId">{{ item.className }}</option>
            }
          </select>
        </label>
        @if (selection()?.student && selection()?.teacher) {
          <label>Vista
            <select #mode [value]="view()" (change)="chooseView(mode.value)">
              <option value="student">Estudiante</option>
              <option value="teacher">Docente</option>
            </select>
          </label>
        }
        @if (nextAfter() !== null) {
          <button type="button" [disabled]="busy()" (click)="loadChoices(nextAfter()!)">Más clases</button>
        }
        <button type="button" [disabled]="busy()" (click)="refresh()">Actualizar permisos</button>
      </div>
      @if (busy()) { <p role="status">Consultando permisos…</p> }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (retry(); as repeat) { <button type="button" (click)="repeat()">Reintentar</button> }
      @if (!busy() && !error() && !choices().length) { <p>No hay clases disponibles para esta cuenta.</p> }

      @for (scope of selectedScopes(); track scope.classId) {
        @if (view() === 'teacher' && scope.teacher) {
          <app-institutional-teacher [scope]="scope" />
        } @else if (scope.student) {
          <app-institutional-student [scope]="scope" />
        }
      }
    </main>
  `,
  styleUrl: './institutional-evaluations.scss',
})
export class InstitutionalEvaluationsComponent extends EvaluationView implements OnInit {
  readonly choices = signal<ClassChoice[]>([]);
  readonly nextAfter = signal<number | null>(null);
  readonly institution = signal<number | null>(null);
  readonly selection = signal<ClassChoice | null>(null);
  readonly view = signal<'student' | 'teacher'>('student');
  readonly institutions = computed(() =>
    [...new Map(this.choices().map(item => [item.institutionId, item])).values()]);
  readonly classOptions = computed(() => this.choices().filter(item => item.institutionId === this.institution()));
  readonly selectedScopes = computed(() => {
    const scope = this.selection();
    return scope ? [scope] : [];
  });

  ngOnInit(): void { this.loadChoices(0); }

  loadChoices(after: number): void {
    this.run(this.api.choices(after), page => {
      this.choices.update(current => after ? [...current, ...page.items] : page.items);
      this.nextAfter.set(page.nextAfter);
    });
  }

  refresh(): void {
    this.clearRestricted();
    this.loadChoices(0);
  }

  chooseInstitution(id: string): void {
    this.selection.set(null);
    this.institution.set(this.institutions().find(item => item.institutionId === Number(id))?.institutionId ?? null);
  }

  chooseClass(id: string): void {
    const scope = this.classOptions().find(item => item.classId === Number(id)) ?? null;
    this.view.set(scope?.student ? 'student' : 'teacher');
    this.selection.set(scope);
  }

  chooseView(value: string): void {
    if (value === 'teacher' && this.selection()?.teacher) this.view.set('teacher');
    if (value === 'student' && this.selection()?.student) this.view.set('student');
  }

  protected override clearRestricted(): void {
    this.chooseInstitution('');
    this.choices.set([]);
    this.nextAfter.set(null);
  }
}
