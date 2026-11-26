import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AgreementDocument, AgreementsService, AgreementText } from '../../core/services/agreements.service';
import { AgreementReadingComponent } from './agreement-reading.component';

interface ReadingState {
  loading?: boolean;
  error?: string;
  documents?: AgreementDocument[];
  text?: AgreementText;
}

const loading: ReadingState = { loading: true };

@Component({
  imports: [RouterLink, AgreementReadingComponent],
  template: `
    <main class="agreements-page">
      <h1>{{ state().text?.document?.title ?? 'Documentos de ChemicalLab' }}</h1>
      <p><a [routerLink]="publicDocument ? '/acuerdos' : '/mi-cuenta/acuerdos'">{{ publicDocument ? 'Documentos públicos' : 'Volver a mis acuerdos' }}</a></p>
      @if (publicDocument) { <p><a routerLink="/auth/login">Ir al inicio de sesión</a></p> }
      @if (state().loading) { <p role="status">Cargando documentos…</p> }
      @if (state().error; as error) { <p role="alert">{{ error }}</p> }
      @if (state().text; as text) { <app-agreement-reading [text]="text" /> }
      @if (state().documents; as documents) {
        @if (documents.length === 0) { <p>No hay documentos públicos vigentes.</p> }
        <ul>
          @for (document of documents; track document.id) {
            <li><a [routerLink]="['/acuerdos', document.id]">{{ document.title }} (versión {{ document.version }})</a></li>
          }
        </ul>
      }
    </main>
  `,
  styleUrl: './agreements.scss',
})
export class AgreementDocumentsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly agreements = inject(AgreementsService);
  protected readonly publicDocument = this.route.snapshot.data['private'] !== true;
  protected readonly state = toSignal(this.route.paramMap.pipe(switchMap((params) => {
    const id = params.get('id');
    const request = id === null
      ? this.agreements.documents().pipe(map((documents): ReadingState => ({ documents })))
      : this.agreements.text(Number(id), this.publicDocument).pipe(map((text): ReadingState => ({ text })));
    return request.pipe(
      startWith(loading),
      catchError(() => of<ReadingState>({ error: 'No se pudo consultar el documento.' })),
    );
  })), { initialValue: loading });
}
