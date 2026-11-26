import { Component, ElementRef, afterNextRender, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `
    <main>
      <h1 #heading tabindex="-1">Ayuda y soporte</h1>
      <h2>Usa el laboratorio con menos descargas</h2>
      <ul>
        <li>Abre la vista previa de un material o captura cuando necesites verlo.</li>
        <li>Si necesitas una copia, usa «Descargar» con la vista previa aún abierta. ChemicalLab puede reutilizar el archivo que ya cargó.</li>
        <li>Al terminar, vuelve a la lista o cambia de clase para salir de la pizarra. Si estás rindiendo una evaluación, envíala desde el intento antes de salir.</li>
        <li>Al publicar un material, usa un archivo legible del tamaño necesario y evita subir copias idénticas.</li>
      </ul>
      <h2>Comparte un comentario</h2>
      <p>
        Si quieres ayudarnos a mejorar el rendimiento y evitar descargas, escribe a
        <a href="mailto:carlosjun.45@gmail.com">carlosjun.45@gmail.com</a>.
        Cuéntanos qué estabas haciendo, qué se puso lento
        o qué archivo tuviste que descargar otra vez. Omite contraseñas, nombres y
        contenido de alumnos.
      </p>
      <a routerLink="/dashboard">Volver al laboratorio</a>
    </main>
  `,
  styles: `
    main {
      max-width: 45rem;
      margin-inline: auto;
      padding: clamp(1rem, 4vw, 2.5rem);
      line-height: 1.6;
    }
    h1, h2 { line-height: 1.25; }
    li + li { margin-block-start: 0.5rem; }
    a { text-decoration: underline; }
  `,
})
export class SupportComponent {
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }
}
