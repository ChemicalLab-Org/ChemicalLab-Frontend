import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fileDownloadName, isPreviewImage } from '../../shared/utils/safe-file.util';
import { EvaluationView, Page } from './catalog-api';
import {
  ContentChoice, ContentDetail, ContentFile, ContentRow, ContentText, Delivery, InstitutionalContentApi, Receipt,
} from './content-api';

interface Editor {
  title: string;
  category: string;
  summary: string;
  explanation: string;
  formationSteps: string;
  keyPoints: string;
  examples: string;
  suggestedActivity: string;
  links: { title: string; url: string }[];
}

@Component({
  selector: 'app-institutional-contents-scope',
  imports: [FormsModule],
  templateUrl: './institutional-contents-scope.component.html',
  styleUrl: './institutional-evaluations.scss',
})
export class InstitutionalContentsScopeComponent extends EvaluationView implements OnInit {
  readonly scope = input.required<ContentChoice>();
  readonly teacher = input.required<boolean>();
  readonly library = signal<ContentRow[]>([]);
  readonly assigned = signal<Delivery[]>([]);
  readonly cursor = signal<number | null>(null);
  readonly detail = signal<ContentDetail | null>(null);
  readonly editor = signal<Editor | null>(null);
  readonly status = signal('');
  readonly selectedDelivery = signal<number | undefined>(undefined);
  readonly attachment = signal<File | null>(null);
  readonly attachmentTitle = signal('');
  readonly preview = signal<{ id: number; url: string } | null>(null);
  private readonly contents = inject(InstitutionalContentApi);

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.closePreview());
  }

  ngOnInit(): void { this.load(0); }

  load(after: number): void {
    if (this.teacher()) {
      this.run(this.contents.library(this.scope(), after), page => this.setPage(this.library, page, after, r => r.revisionId));
    } else {
      this.run(this.contents.assigned(this.scope(), after), page => this.setPage(this.assigned, page, after, r => r.deliveryId));
    }
  }

  private setPage<T>(rows: { (): T[]; set(value: T[]): void }, page: Page<T>, after: number, id: (row: T) => number): void {
    const merged = after ? [...rows(), ...page.items] : page.items;
    rows.set([...new Map(merged.map(row => [id(row), row])).values()]);
    this.cursor.set(page.nextAfter);
  }

  open(row: ContentRow | Delivery): void {
    this.closeDetail();
    const delivery = 'deliveryId' in row ? row.deliveryId : undefined;
    this.run(this.contents.detail(this.scope(), row, delivery), detail => {
      this.selectedDelivery.set(delivery);
      this.setDetail(detail);
    });
  }

  newDraft(): void {
    this.closeDetail();
    this.editor.set(this.toEditor());
  }

  save(): void {
    const editor = this.editor();
    if (!editor) return;
    const fields = this.toText(editor);
    if (!fields.title || !fields.category) {
      this.error.set('Introduce un título y una categoría.');
      return;
    }
    const previous = this.detail();
    const request = previous ? this.contents.edit(this.scope(), previous, fields) : this.contents.command(this.scope(), fields);
    this.run(request, receipt => {
      this.setDetail(this.updated(receipt, fields));
      this.upsert(receipt, fields);
      this.status.set('Borrador guardado.');
    });
  }

  hasUnsavedChanges(row: ContentRow): boolean {
    const detail = this.detail();
    const editor = this.editor();
    return !!editor && detail?.revisionId === row.revisionId
      && JSON.stringify(this.toText(editor)) !== JSON.stringify(detail.text);
  }

  hasSuccessor(row: ContentRow): boolean {
    return this.library().some(candidate => candidate.contentId === row.contentId && candidate.number > row.number);
  }

  transition(row: ContentRow, action: 'publish' | 'assign' | 'successor'): void {
    this.run(this.contents.transition(this.scope(), row, action), receipt => {
      if (action === 'assign') {
        this.library.update(rows => rows.map(item => item.revisionId === row.revisionId ? { ...item, assigned: true } : item));
        this.status.set(receipt.recipients === 1 ? 'Asignado a 1 estudiante de esta clase.'
          : `Asignado a ${receipt.recipients} estudiantes de esta clase.`);
        return;
      }
      const opened = this.detail();
      if (opened?.revisionId === row.revisionId) {
        this.setDetail(this.updated(receipt, opened.text));
      } else if (action === 'successor') {
        this.open({ ...row, ...receipt });
      }
      this.upsert(receipt, row, row);
      if (action === 'publish' && this.detail()?.revisionId === row.revisionId) this.editor.set(null);
      this.status.set(action === 'publish' ? 'Revisión publicada.' : 'Nuevo borrador creado.');
    });
  }

  chooseFile(event: Event): void {
    const control = event.target as HTMLInputElement;
    this.attachment.set(control.files?.item(0) ?? null);
    control.value = '';
  }

  upload(): void {
    const detail = this.detail();
    const file = this.attachment();
    if (!detail || !file) return;
    this.run(this.contents.upload(this.scope(), detail, file, this.attachmentTitle()), receipt => {
      this.updateFile(detail, receipt);
      this.status.set('Archivo guardado.');
    });
  }

  removeFile(): void {
    const detail = this.detail();
    if (!detail?.file) return;
    this.run(this.contents.transition(this.scope(), detail, 'remove-file'), receipt => {
      this.updateFile(detail, receipt);
      this.status.set('Archivo retirado del borrador.');
    });
  }

  openFile(file: ContentFile, preview: boolean): void {
    const detail = this.detail();
    if (!detail) return;
    const current = this.preview();
    if (current?.id === file.id) {
      if (!preview) this.download(file.name, file.mime, current.url);
      return;
    }
    this.run(this.contents.download(this.scope(), detail, file.id, preview, this.selectedDelivery()), blob => {
      if (blob.type !== file.mime || (preview && !isPreviewImage(blob.type))) {
        this.error.set('El tipo recibido no permite abrir este archivo.');
        return;
      }
      const url = URL.createObjectURL(blob);
      if (preview) {
        this.closePreview();
        this.preview.set({ id: file.id, url });
      } else {
        this.download(file.name, blob.type, url);
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    });
  }

  closePreview(): void {
    const current = this.preview();
    if (current) URL.revokeObjectURL(current.url);
    this.preview.set(null);
  }

  closeDetail(): void {
    this.closePreview();
    this.detail.set(null);
    this.editor.set(null);
    this.attachment.set(null);
    this.attachmentTitle.set('');
    this.selectedDelivery.set(undefined);
    this.error.set('');
    this.retry.set(null);
    this.status.set('');
  }

  protected override clearRestricted(): void {
    const error = this.error();
    this.closeDetail();
    this.error.set(error);
    this.library.set([]);
    this.assigned.set([]);
    this.cursor.set(null);
  }

  private updateFile(detail: ContentDetail, receipt: Receipt): void {
    this.closePreview();
    this.attachment.set(null);
    this.attachmentTitle.set('');
    this.detail.set(this.updated(receipt, detail.text));
    this.upsert(receipt, detail.text);
  }

  private updated(receipt: Receipt, text: ContentText): ContentDetail {
    return { ...receipt, text, materialCount: text.links.length + Number(!!receipt.file) };
  }

  private setDetail(detail: ContentDetail): void {
    this.closePreview();
    this.attachment.set(null);
    this.attachmentTitle.set('');
    this.detail.set(detail);
    this.editor.set(this.teacher() && detail.status === 'DRAFT' ? this.toEditor(detail.text) : null);
  }

  private upsert(receipt: Receipt, text: Pick<ContentText, 'title' | 'category'>, parent?: ContentRow): void {
    const known = this.library().find(row => row.revisionId === receipt.revisionId);
    const row: ContentRow = {
      canEdit: (known ?? parent)?.canEdit ?? true,
      canPublish: (known ?? parent)?.canPublish ?? true,
      canAssign: (known ?? parent)?.canAssign ?? true,
      assigned: known?.assigned ?? false,
      title: text.title, category: text.category,
      contentId: receipt.contentId, revisionId: receipt.revisionId, number: receipt.number,
      version: receipt.version, status: receipt.status,
    };
    this.library.update(rows => known ? rows.map(item => item.revisionId === row.revisionId ? row : item) : [...rows, row]);
  }

  private download(name: string, mime: string, url: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileDownloadName(name, mime);
    link.click();
  }

  private toEditor(text?: ContentText): Editor {
    return {
      title: text?.title ?? '', category: text?.category ?? '', summary: text?.summary ?? '',
      explanation: text?.explanation ?? '', formationSteps: text?.formationSteps.join('\n') ?? '',
      keyPoints: text?.keyPoints.join('\n') ?? '', examples: text?.examples.join('\n') ?? '',
      suggestedActivity: text?.suggestedActivity ?? '',
      links: text?.links.map(link => ({ title: link.title ?? '', url: link.url })) ?? [],
    };
  }

  private toText(editor: Editor): ContentText {
    const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
    return {
      title: editor.title.trim(), category: editor.category.trim(), summary: editor.summary.trim() || null,
      explanation: editor.explanation.trim() || null, formationSteps: lines(editor.formationSteps),
      keyPoints: lines(editor.keyPoints), examples: lines(editor.examples), suggestedActivity: editor.suggestedActivity.trim() || null,
      links: editor.links.map(link => ({ title: link.title.trim() || null, url: link.url.trim() })),
    };
  }
}
