import { z } from 'zod'

/**
 * Los campos declarados en el blueprint, y solo esos.
 *
 * `.strict()` no es cosmetico: sin el, un cliente puede colar un campo extra --
 * `role`, `owner_id`, `estado` -- que ninguna regla mira porque nadie sabia que
 * existia. Rechazar lo no declarado es lo que hace que la lista de campos signifique
 * algo.
 *
 * Los tipos concretos se afinan al escribir el motor de este producto; lo que esta
 * fijado desde el blueprint es QUE campos existen.
 */
export const esquemaApprovals = z
  .object({
  document_id: z.unknown(),
  approver_id: z.unknown(),
  decision: z.unknown(),
  motivo: z.unknown(),
  campos_corregidos_json: z.unknown(),
  decidido_en: z.unknown(),
  })
  .strict()

export type Approvals = z.infer<typeof esquemaApprovals>
