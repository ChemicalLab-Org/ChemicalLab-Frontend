import { Component, input, output } from '@angular/core';
@Component({
  selector: 'app-pagination',
  standalone: true,
  styles: [`:host{display:block;margin:1rem 0}nav{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}button{padding:.5rem 1rem;cursor:pointer}button:disabled{cursor:default;opacity:.5}`],
  template: `<nav aria-label="Paginación">
    <button type="button" (click)="pageChange.emit(page()-1)" [disabled]="loading() || page()===0">Anterior</button>
    <span>Página {{ page()+1 }} de {{ totalPages() || 1 }} · {{ total() }} registros</span>
    <button type="button" (click)="pageChange.emit(page()+1)" [disabled]="loading() || page()+1>=totalPages()">Siguiente</button>
  </nav>`,
})
export class PaginationComponent {
  readonly page=input(0);
  readonly totalPages=input(0);
  readonly total=input(0);
  readonly loading=input(false);
  readonly pageChange=output<number>();
}
