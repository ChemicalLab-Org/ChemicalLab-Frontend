import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { AgreementText } from '../../core/services/agreements.service';

@Component({
  selector: 'app-agreement-reading',
  imports: [DatePipe],
  template: `
    <p>Versión {{ text().document.version }} · Publicada el {{ text().document.publishedAt | date:'dd/MM/yyyy' }}</p>
    <p>{{ text().document.changeSummary }}</p>
    <div class="body">{{ text().body }}</div>
    <details>
      <summary>Huella SHA-256 del texto</summary>
      <code>{{ text().document.sha256 }}</code>
    </details>
  `,
  styles: `
    .body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; margin-bottom: 1rem; }
    code { overflow-wrap: anywhere; }
    summary { cursor: pointer; }
  `,
})
export class AgreementReadingComponent {
  readonly text = input.required<AgreementText>();
}
