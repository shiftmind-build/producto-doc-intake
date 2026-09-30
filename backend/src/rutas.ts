import type { Express, Request, Response } from 'express'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { asyncHandler } from './lib/asyncHandler.js'
import { requireRole, verificarAuth } from './lib/auth.js'
import { REGLAS_BASE, decide, evalua, type Contexto } from './motor/triaje.js'

/**
 * Las rutas de Doc Intake.
 *
 * La regla del producto se aplica aqui y no en el cliente: un documento aprobado
 * automaticamente no pasa por ninguna pantalla, asi que si el triaje viviera en el
 * navegador bastaria con no abrirlo para saltarselo.
 */

function secretoValido(req: Request) {
  const esperado = process.env['CRON_SECRET']
  if (!esperado) return false
  return req.header('x-cron-secret') === esperado
}

export function montaRutas(app: Express) {
  /**
   * Entra un documento ya extraido y se decide que hacer con el.
   *
   * Lo llama el proceso de entrada, no una persona: por eso va con secreto de servicio.
   */
  app.post(
    '/documentos/triar',
    asyncHandler(async (req: Request, res: Response) => {
      if (!secretoValido(req)) {
        res.status(401).json({ error: 'no autorizado' })
        return
      }
      const cuerpo = req.body as {
        document_id?: string
        campos?: Record<string, unknown>
        confianza?: number
        pedido?: Contexto['pedido']
      }
      if (!cuerpo?.document_id || !cuerpo.campos || typeof cuerpo.confianza !== 'number') {
        res.status(400).json({ error: 'faltan document_id, campos o confianza' })
        return
      }

      const db = getFirestore()
      // El mismo documento dos veces llega mas de lo que parece: un proveedor que
      // reenvia, un buzon que reintenta. Se detecta por hash, no por nombre de fichero.
      const hash = cuerpo.campos['hash_sha256']
      const hashesVistos = new Set<string>()
      if (typeof hash === 'string') {
        const previos = await db
          .collection('documents')
          .where('hash_sha256', '==', hash)
          .limit(2)
          .get()
        previos.docs
          .filter((d) => d.id !== cuerpo.document_id)
          .forEach(() => hashesVistos.add(hash))
      }

      const validaciones = evalua(REGLAS_BASE, cuerpo.campos, {
        ...(cuerpo.pedido ? { pedido: cuerpo.pedido } : {}),
        hashesVistos,
      })
      const decision = decide(validaciones, cuerpo.confianza)

      const lote = db.batch()
      validaciones.forEach((v) =>
        lote.set(db.collection('validations').doc(), {
          document_id: cuerpo.document_id,
          regla: v.regla,
          resultado: v.resultado,
          detalle: v.detalle,
          ejecutada_en: Timestamp.now(),
        }),
      )
      lote.update(db.collection('documents').doc(cuerpo.document_id), {
        estado: decision.via === 'auto' ? 'aprobado_automatico' : 'pendiente_persona',
      })
      await lote.commit()

      console.log(`[triaje] ${cuerpo.document_id} -> ${decision.via} ${decision.motivos.join(' | ')}`)
      res.status(200).json(decision)
    }),
  )

  /** La bandeja: solo lo que necesita una persona. Ese es el producto. */
  app.get(
    '/bandeja',
    requireRole(['approver', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const pendientes = await db
        .collection('documents')
        .where('estado', '==', 'pendiente_persona')
        .orderBy('recibido_en', 'asc')
        .limit(100)
        .get()
      res.status(200).json({
        total: pendientes.size,
        documentos: pendientes.docs.map((d) => ({ id: d.id, ...d.data() })),
      })
    }),
  )

  /** Aprobar o rechazar. Inmutable: una decision no se reescribe, se anyade otra. */
  app.post(
    '/documentos/:id/decidir',
    requireRole(['approver']),
    asyncHandler(async (req: Request, res: Response) => {
      const quien = await verificarAuth(req)
      const decision = (req.body as { decision?: string })?.decision
      if (decision !== 'aprobado' && decision !== 'rechazado') {
        res.status(400).json({ error: "decision debe ser 'aprobado' o 'rechazado'" })
        return
      }
      const db = getFirestore()
      const ya = await db
        .collection('approvals')
        .where('document_id', '==', req.params['id'])
        .limit(1)
        .get()
      if (!ya.empty) {
        res.status(409).json({ error: 'ese documento ya se decidio' })
        return
      }
      await db.collection('approvals').add({
        document_id: req.params['id'],
        approver_id: quien.uid,
        decision,
        motivo: String((req.body as { motivo?: unknown })?.motivo ?? ''),
        campos_corregidos_json: (req.body as { campos?: unknown })?.campos ?? null,
        decidido_en: Timestamp.now(),
      })
      await db.collection('documents').doc(String(req.params['id'])).update({ estado: decision })
      res.status(200).json({ ok: true })
    }),
  )
}
