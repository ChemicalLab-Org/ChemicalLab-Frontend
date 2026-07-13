import { Injectable } from '@angular/core';

/**
 * Registro de tareas a ejecutar cuando se cierra o limpia la sesión.
 *
 * Permite que servicios "pesados" —como las conexiones WebSocket/STOMP de la pizarra, que
 * arrastran sockjs-client y @stomp/stompjs— se cierren durante el logout sin que AuthService
 * tenga que importarlos. Importarlos directamente los llevaría al bundle inicial y rompería el
 * presupuesto de tamaño; en su lugar cada servicio se registra de forma perezosa al
 * instanciarse (cuando su feature se carga) y aquí solo se guardan callbacks ligeros.
 */
@Injectable({ providedIn: 'root' })
export class SessionCleanupService {
  private readonly tasks = new Set<() => void>();

  /** Registra una tarea de limpieza (idempotente por identidad de la función). */
  register(task: () => void): void {
    this.tasks.add(task);
  }

  /** Ejecuta todas las tareas registradas. Un fallo aislado no impide las demás. */
  runAll(): void {
    this.tasks.forEach((task) => {
      try {
        task();
      } catch {
        // Una limpieza fallida no debe impedir las demás ni el cierre de sesión.
      }
    });
  }
}
