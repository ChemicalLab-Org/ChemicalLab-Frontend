import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TitleCasePipe } from '@angular/common';

/**
 * Tipo visual de un componente, solo para elegir el color de la representación.
 * No tiene significado químico estricto; es una ayuda didáctica.
 */
export type AnimKind = 'metal' | 'nonmetal' | 'oxygen' | 'hydrogen' | 'group';

/**
 * Componente visual (uno de los reactivos) que pinta la simulación. Se construye
 * solo con datos ya disponibles en la selección del usuario y la respuesta del
 * backend; no recalcula química ni subíndices.
 */
export interface AnimComponent {
  readonly symbol: string;
  readonly name: string;
  readonly value: number;
  readonly sign: '+' | '-';
  readonly kind: AnimKind;
}

/** Máximo de puntos de valencia a dibujar alrededor de una partícula. */
const MAX_VALENCE_DOTS = 8;

/**
 * Simulación didáctica de la formación de un compuesto. Es una capa puramente
 * visual: la fórmula final llega desde el backend mediante el input `formula`.
 *
 *  - Sin `formula` (selección sin formar): las partículas flotan suavemente.
 *  - Con `formula` (compuesto formado): las partículas se acercan, se combinan
 *    en el centro y aparece el compuesto, en bucle continuo y ligero.
 */
@Component({
  selector: 'app-compound-animation',
  standalone: true,
  imports: [TitleCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./compound-animation.component.scss'],
  template: `
    <div class="sim" [class.sim--formed]="formed()" aria-hidden="true">
      <div class="sim__stage">
        @for (c of components(); track $index; let i = $index) {
          <div
            class="atom"
            [attr.data-kind]="c.kind"
            [class.atom--left]="i === 0"
            [class.atom--right]="i === 1"
          >
            <span class="atom__core">
              <span class="atom__symbol">{{ c.symbol }}</span>
              @for (a of dots(c.value); track $index) {
                <span class="atom__dot" [style.--a]="a + 'deg'"></span>
              }
            </span>
            <span class="atom__name">{{ c.name | titlecase }}</span>
            <span class="atom__valence" [attr.data-sign]="c.sign">{{ c.sign }}{{ c.value }}</span>
          </div>
        }

        @if (formed()) {
          <div class="compound">
            <span class="compound__bubble">
              <span class="compound__formula">{{ formula() }}</span>
            </span>
          </div>
        }
      </div>

      <p class="sim__caption">
        @if (formed()) {
          Simulación didáctica de la formación del compuesto
        } @else {
          Representación de los componentes seleccionados
        }
      </p>
    </div>
  `,
})
export class CompoundAnimationComponent {
  /** Los dos reactivos a representar. */
  readonly components = input.required<readonly AnimComponent[]>();
  /** Fórmula final del backend, o null mientras no haya compuesto formado. */
  readonly formula = input<string | null>(null);

  /** Hay compuesto formado cuando llega una fórmula real desde el backend. */
  readonly formed = computed<boolean>(() => {
    const value = this.formula();
    return value !== null && value.trim() !== '';
  });

  /**
   * Ángulos (en grados) para distribuir los puntos de valencia alrededor de la
   * partícula. La cantidad refleja la valencia/carga seleccionada, acotada para
   * que no se desborde la representación.
   */
  dots(value: number): readonly number[] {
    const count = Math.min(Math.max(Math.round(value), 0), MAX_VALENCE_DOTS);
    return Array.from({ length: count }, (_, i) => (360 / count) * i);
  }
}
