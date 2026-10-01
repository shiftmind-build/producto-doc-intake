import type { Express, Request, Response } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { asyncHandler } from './lib/asyncHandler.js'
import { requireRole } from './lib/auth.js'
import { CONFIANZA_MINIMA, REGLAS_BASE } from './motor/triaje.js'

/**
 * Las lecturas de la bandeja.
 *
 * Un documento en Firestore esta repartido en tres colecciones -- `documents` dice que
 * llego, `extractions` que se leyo y con cuanta confianza, `validations` que reglas
 * fallaron -- y en la pantalla eso tiene que ser una fila con el motivo escrito.
 *
 * Componer eso aqui y no en el navegador no es una preferencia: si la pantalla hiciera
 * tres llamadas por documento, una bandeja de cuarenta serian ciento veinte viajes, y
 * ademas cada pestaña abierta los repetiria.
 *
 * Lo que NO hace este fichero es rellenar huecos. Si la extraccion no guardo el total,
 * el total va vacio y la pantalla ensena un guion. Un numero inventado en una bandeja de
 * facturas es dinero que sale de la cuenta de alguien.
 */

function texto(v: unknown) {
  return typeof v === 'string' ? v : ''
}

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function segundos(t: unknown): number {
  if (t && typeof t === 'object') {
    const o = t as { _seconds?: number; seconds?: number; toMillis?: () => number }
    if (typeof o.toMillis === 'function') return Math.floor(o.toMillis() / 1000)
    if (typeof o._seconds === 'number') return o._seconds
    if (typeof o.seconds === 'number') return o.seconds
  }
  return 0
}

/** El nombre de fichero, sacado de la url. Es lo que la persona reconoce de un vistazo. */
function nombreDeArchivo(url: string) {
  const sinQuery = url.split('?')[0] ?? url
  const trozo = sinQuery.split('/').pop() ?? ''
  try {
    return decodeURIComponent(trozo) || 'document'
  } catch {
    return trozo || 'document'
  }
}

type CamposLeidos = Record<string, unknown>

function camposDe(json: unknown): CamposLeidos {
  if (json && typeof json === 'object') return json as CamposLeidos
  if (typeof json === 'string') {
    try {
      const v: unknown = JSON.parse(json)
      return v && typeof v === 'object' ? (v as CamposLeidos) : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Lee de un tiron lo que hace falta de varios documentos.
 *
 * `in` acepta treinta por consulta. Partirlo aqui y no en quien llama evita que la
 * bandeja empiece a perder documentos en silencio el dia que pasen de treinta.
 */
async function porDocumento(coleccion: string, ids: string[]) {
  const db = getFirestore()
  const salida = new Map<string, Array<Record<string, unknown>>>()
  for (let i = 0; i < ids.length; i += 30) {
    const tanda = ids.slice(i, i + 30)
    if (tanda.length === 0) continue
    const snap = await db.collection(coleccion).where('document_id', 'in', tanda).limit(300).get()
    for (const d of snap.docs) {
      const docId = texto(d.data()['document_id'])
      const lista = salida.get(docId) ?? []
      lista.push({ id: d.id, ...d.data() })
      salida.set(docId, lista)
    }
  }
  return salida
}

const TOPE_BANDEJA = 100

export function montaPanel(app: Express) {
  /**
   * La bandeja: solo lo que necesita una persona, con el motivo ya escrito al lado.
   *
   * Y las dos cifras de arriba juntas. Cuantos llegaron y cuantos pasaron solos: la
   * segunda sin la primera es un numero sin escala, y es justo la que dice si el
   * producto esta haciendo su trabajo.
   */
  app.get(
    '/bandeja',
    requireRole(['approver', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const pendientes = await db
        .collection('documents')
        .where('estado', '==', 'pendiente_persona')
        .limit(TOPE_BANDEJA)
        .get()

      const ids = pendientes.docs.map((d) => d.id)
      const [extracciones, validaciones] = await Promise.all([
        porDocumento('extractions', ids),
        porDocumento('validations', ids),
      ])

      const documentos = pendientes.docs
        .map((d) => {
          const doc = d.data()
          const ex = extracciones.get(d.id)?.[0]
          const campos = camposDe(ex?.['campos_json'])
          const confianza = numero(ex?.['confianza'])
          const fallos = (validaciones.get(d.id) ?? []).filter((v) => v['resultado'] === 'falla')

          // El motivo que se ensena es el mismo que decidio parar el documento, no una
          // etiqueta generica. Sin esto hay que abrir cada uno para saber que tenia.
          const motivos = fallos.map((v) => texto(v['detalle']) || texto(v['regla']))
          if (confianza !== undefined && confianza < CONFIANZA_MINIMA) {
            motivos.unshift(`confidence ${confianza.toFixed(2)} is below the ${CONFIANZA_MINIMA} threshold`)
          }

          return {
            id: d.id,
            nombre_fichero: nombreDeArchivo(texto(doc['archivo_url'])),
            tipo: texto(doc['tipo']) || 'invoice',
            proveedor: texto(campos['proveedor']),
            total_centavos: numero(campos['total_centavos']),
            moneda: texto(campos['moneda']) || 'EUR',
            recibido_en: doc['recibido_en'],
            confianza,
            via: 'persona' as const,
            estado: texto(doc['estado']) || 'pendiente_persona',
            motivos,
          }
        })
        // Lo mas viejo primero: el que lleva mas esperando es el que tiene a alguien
        // esperando al otro lado. En memoria, para no pedir un indice compuesto.
        .sort((a, b) => segundos(a.recibido_en) - segundos(b.recibido_en))

      // Lo de hoy. Dos consultas acotadas por fecha, sin segundo `where`, asi que no
      // necesitan indice: el emulador no los exige y produccion si.
      const medianoche = new Date()
      medianoche.setHours(0, 0, 0, 0)
      const deHoy = await db
        .collection('documents')
        .where('recibido_en', '>=', medianoche)
        .limit(1000)
        .get()
      const recibidos_hoy = deHoy.size
      const auto_hoy = deHoy.docs.filter((d) => d.data()['estado'] === 'auto_aprobado').length

      res.status(200).json({ total: documentos.length, documentos, auto_hoy, recibidos_hoy })
    }),
  )

  /** Un documento entero: lo que se leyo, con cuanta confianza, y que regla fallo. */
  app.get(
    '/documentos/:id',
    requireRole(['approver', 'admin']),
    asyncHandler(async (req: Request, res: Response) => {
      const db = getFirestore()
      const id = String(req.params['id'])
      const doc = await db.collection('documents').doc(id).get()
      if (!doc.exists) {
        res.status(404).json({ error: 'ese documento no existe' })
        return
      }

      const [exSnap, vaSnap] = await Promise.all([
        db.collection('extractions').where('document_id', '==', id).limit(5).get(),
        db.collection('validations').where('document_id', '==', id).limit(50).get(),
      ])

      const ex = exSnap.docs[0]?.data()
      const leidos = camposDe(ex?.['campos_json'])
      const confianza = numero(ex?.['confianza'])

      /*
       * La confianza va en el documento, no en cada campo.
       *
       * Asi que aqui NO se reparte la del documento entre los campos: eso pintaria un
       * 71% al lado de un nombre de proveedor que se leyo perfectamente, y la persona
       * dejaria de fiarse del numero justo cuando mas falta hace. El campo sale sin
       * confianza y la pantalla no pinta la pastilla. El dia que la extraccion la
       * guarde por campo, este sitio la pasa sin tocar nada mas.
       */
      const campos = Object.entries(leidos)
        .filter(([k]) => k !== 'hash_sha256')
        .map(([nombre, valor]) => ({ nombre, valor: String(valor ?? '') }))

      res.status(200).json({
        documento: {
          id: doc.id,
          nombre_fichero: nombreDeArchivo(texto(doc.data()!['archivo_url'])),
          tipo: texto(doc.data()!['tipo']) || 'invoice',
          proveedor: texto(leidos['proveedor']),
          total_centavos: numero(leidos['total_centavos']),
          moneda: texto(leidos['moneda']) || 'EUR',
          recibido_en: doc.data()!['recibido_en'],
          confianza,
          via: 'persona',
          estado: texto(doc.data()!['estado']),
          motivos: [],
        },
        campos,
        validaciones: vaSnap.docs.map((d) => {
          const v = d.data()
          return {
            regla: texto(v['regla']),
            severidad: REGLAS_BASE.find((r) => r.nombre === texto(v['regla']))?.severidad ?? 'aviso',
            resultado: v['resultado'] === 'falla' ? 'falla' : 'pasa',
            detalle: texto(v['detalle']),
          }
        }),
      })
    }),
  )

  /**
   * Las reglas, explicadas.
   *
   * Salen del motor y no de una lista escrita a mano aqui: una pantalla que describe
   * reglas distintas de las que se aplican es peor que no tener la pantalla.
   */
  app.get(
    '/reglas',
    requireRole(['approver', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      res.status(200).json({
        reglas: REGLAS_BASE.map((r) => ({
          nombre: r.nombre,
          severidad: r.severidad,
          explicacion: EXPLICACIONES[r.nombre] ?? '',
        })),
        confianza_minima: CONFIANZA_MINIMA,
      })
    }),
  )
}

/**
 * Las reglas en idioma de persona.
 *
 * El nombre tecnico se queda (es el que aparece en los registros y en el motivo), y al
 * lado va lo que comprueba. Sin esto, la pantalla de reglas es una lista de nombres de
 * funcion.
 */
const EXPLICACIONES: Record<string, string> = {
  total_presente: 'A total was read, and it is a number.',
  total_positivo: 'The total is greater than zero. A credit note is a different document.',
  cuadra_con_pedido:
    'The total matches the purchase order within one cent. A cent is rounding; a euro is not.',
  no_duplicado: 'This exact file has not arrived before. Catches the resent invoice.',
  proveedor_coincide:
    'The supplier name matches the order. Legal names and trading names differ a lot.',
  fecha_razonable: 'The date is not in the future and not more than two years old.',
}
