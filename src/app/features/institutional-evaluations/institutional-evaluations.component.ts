import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClassChoice, EvaluationView } from './catalog-api';
import { InstitutionalStudentComponent } from './institutional-student.component';
import { InstitutionalTeacherComponent } from './institutional-teacher.component';
import { ContentChoice, InstitutionalContentApi } from './content-api';
import { InstitutionalContentsScopeComponent } from './institutional-contents-scope.component';
import { InstitutionalWhiteboardsScopeComponent } from './institutional-whiteboards-scope.component';

@Component({
  selector: 'app-institutional-evaluations',
  imports: [RouterLink, InstitutionalStudentComponent, InstitutionalTeacherComponent, InstitutionalContentsScopeComponent,
    InstitutionalWhiteboardsScopeComponent],
  template: `
    <main class="institutional">
      <a routerLink="/dashboard">Volver al inicio</a>
      <a routerLink="/mi-cuenta/acuerdos">Mis acuerdos y privacidad</a>
      <h1>{{ isBoard ? 'Pizarras institucionales' : isContent ? 'Contenidos institucionales' : 'Evaluaciones institucionales' }}</h1>
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

      @for (scope of selectedScopes(); track scope.institutionId + ':' + scope.classId + ':' + view()) {
        @if (isBoard) {
          @defer (when isBoard) {
            <app-institutional-whiteboards-scope [scope]="scope" [teacher]="view() === 'teacher'" />
          }
        } @else if (isContent) {
          <app-institutional-contents-scope [scope]="contentScope(scope)" [teacher]="view() === 'teacher'" />
        } @else if (view() === 'teacher' && scope.teacher) {
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
  private readonly section = inject(ActivatedRoute, { optional: true })?.snapshot.data['section'];
  readonly isContent = this.section === 'contents';
  readonly isBoard = this.section === 'boards';
  private readonly contents = inject(InstitutionalContentApi);
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
    const request = this.isContent ? this.contents.choices(after) : this.api.choices(after);
    this.run(request, page => {
      this.choices.update(current => after ? [...current, ...page.items] : page.items);
      this.nextAfter.set(page.nextAfter);
    });
  }

  contentScope(scope: ClassChoice): ContentChoice { return scope as ContentChoice; }

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
