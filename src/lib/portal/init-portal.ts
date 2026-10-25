/**
 * Aggregador de inicialización del portal.
 *
 * Llama initPhase2Schema() → initPhase3Schema() en el orden correcto,
 * evitando el ciclo que se crearía si schema.ts importara schema-phase3.ts.
 *
 * Uso:
 *   import { initPortalSchema } from "./init-portal";
 *   initPortalSchema(); // en lugar de initPhase2Schema() + initPhase3Schema()
 *
 * auth.ts, tickets.ts y ticket-types.ts deben usar este módulo para que
 * las tablas y columnas de Fase 3 existan antes de cualquier consulta.
 */
import { initPhase2Schema } from "./schema";
import { initPhase3Schema } from "./schema-phase3";
import { initPhase4Schema } from "./schema-phase4";

let initialized = false;

export function initPortalSchema(): void {
  if (initialized) return;
  initialized = true;
  // Phase 2 se llama primero (initPhase3Schema la llama internamente también,
  // pero explicitamos el orden aquí para documentación).
  initPhase2Schema();
  initPhase3Schema();
  initPhase4Schema();
}

// Auto-inicializar al importar (mismo patrón que schema.ts y schema-phase3.ts).
initPortalSchema();
