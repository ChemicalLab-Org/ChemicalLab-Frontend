import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { CompoundsComponent } from './compounds.component';

describe('CompoundsComponent nomenclature tracking', () => {
  function createHarness() {
    const trackNomenclatureSelection = vi.fn();
    const component = Object.create(CompoundsComponent.prototype) as CompoundsComponent;
    Object.assign(component, {
      nomenclatureOptions: [
        { value: 'traditional', label: 'Tradicional' },
        { value: 'stock', label: 'Stock' },
        { value: 'systematic', label: 'Sistemática' },
      ],
      selectedNomenclature: signal<'traditional' | 'stock' | 'systematic'>('traditional'),
      usageMetrics: { trackNomenclatureSelection },
    });
    return { component, trackNomenclatureSelection };
  }

  function select(value: string): Event {
    return { target: { value } } as unknown as Event;
  }

  it('registra cada cambio real con la etiqueta visible', () => {
    const { component, trackNomenclatureSelection } = createHarness();

    component.onNomenclatureChange(select('stock'));
    component.onNomenclatureChange(select('systematic'));
    component.onNomenclatureChange(select('traditional'));

    expect(trackNomenclatureSelection.mock.calls).toEqual([
      ['Stock'],
      ['Sistemática'],
      ['Tradicional'],
    ]);
  });

  it('no registra el valor inicial repetido ni valores inválidos', () => {
    const { component, trackNomenclatureSelection } = createHarness();

    component.onNomenclatureChange(select('traditional'));
    component.onNomenclatureChange(select('unknown'));

    expect(trackNomenclatureSelection).not.toHaveBeenCalled();
  });
});
