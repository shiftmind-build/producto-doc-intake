/**
 * El triaje. Es el producto.
 *
 * Extraer campos de una factura lo hace cualquier modelo. Lo que se paga aqui es lo
 * contrario: que de cien documentos, noventa no lleguen a ninguna persona.
 *
 * Y la regla que lo gobierna es una sola, escrita al reves de como la escribe casi
 * todo el mundo:
 *
 *   Un documento va a una persona cuando NO podemos demostrar que esta bien.
 *
 * No "cuando el modelo duda". La duda del modelo es una de las senyales, no la unica
 * ni la de mas peso: un modelo puede estar segurisimo de un total que no cuadra con el
 * pedido. Por eso la confianza es un motivo mas entre varios, y cualquiera de ellos
 * basta para llamar a un humano.
 *
 * La consecuencia practica, que es la que hay que defender delante de un cliente: este
 * sistema prefiere molestar de mas a aprobar de menos. Un documento aprobado solo debe
 * poder serlo cuando todas las reglas pasaron.
 */

export type Severidad = 'bloqueante' | 'aviso'

export type Regla = {
  nombre: string
  severidad: Severidad
  /** Devuelve null si pasa, o el detalle de por que no. */
  comprueba: (campos: Record<string, unknown>, contexto: Contexto) => string | null
}

export type Contexto = {
  /** Lo que el negocio ya sabia antes de que llegara el documento. */
  pedido?: { total_centavos?: number; proveedor?: string } | undefined
  /** Hash de documentos ya recibidos, para detectar el mismo dos veces. */
  hashesVistos?: Set<string> | undefined
}

export type Validacion = { regla: string; severidad: Severidad; resultado: 'pasa' | 'falla'; detalle: string }

export type Decision = {
  /** `auto` no significa "pagado": significa que ninguna persona necesita mirarlo. */
  via: 'auto' | 'persona'
  motivos: string[]
  validaciones: Validacion[]
}

/**
 * Por debajo de esto, a una persona aunque todas las reglas pasen.
 *
 * 0.85 y no 0.5: el coste de un falso negativo (molestar a alguien con un documento
 * correcto) son treinta segundos. El de un falso positivo (aprobar una factura mal
 * leida) es dinero que sale de la cuenta del cliente. Los dos errores no cuestan igual,
 * asi que el umbral no puede estar en el medio.
 */
export const CONFIANZA_MINIMA = 0.85

export function evalua(reglas: Regla[], campos: Record<string, unknown>, contexto: Contexto = {}) {
  return reglas.map<Validacion>((r) => {
    const fallo = r.comprueba(campos, contexto)
    return {
      regla: r.nombre,
      severidad: r.severidad,
      resultado: fallo ? 'falla' : 'pasa',
      detalle: fallo ?? 'ok',
    }
  })
}

export function decide(
  validaciones: Validacion[],
  confianza: number,
  minima = CONFIANZA_MINIMA,
): Decision {
  const motivos: string[] = []

  for (const v of validaciones) {
    if (v.resultado === 'falla' && v.severidad === 'bloqueante') {
      motivos.push(`${v.regla}: ${v.detalle}`)
    }
  }
  if (confianza < minima) {
    motivos.push(`confianza ${confianza.toFixed(2)} por debajo de ${minima}`)
  }

  // Un aviso suelto no llama a nadie: si cada rareza parase un documento, la bandeja
  // se llenaria y el cliente acabaria aprobando en bloque sin mirar -- que es peor que
  // no tener triaje. Dos a la vez ya no es una rareza, es un patron.
  const avisos = validaciones.filter((v) => v.resultado === 'falla' && v.severidad === 'aviso')
  if (avisos.length >= 2) {
    motivos.push(`${avisos.length} avisos a la vez: ${avisos.map((a) => a.regla).join(', ')}`)
  }

  return { via: motivos.length > 0 ? 'persona' : 'auto', motivos, validaciones }
}

/**
 * Las reglas de serie. Un cliente anyade las suyas; estas vienen puestas porque son las
 * que fallan en todas partes.
 */
export const REGLAS_BASE: Regla[] = [
  {
    nombre: 'total_presente',
    severidad: 'bloqueante',
    comprueba: (c) =>
      typeof c['total_centavos'] === 'number' && Number.isFinite(c['total_centavos'])
        ? null
        : 'no se leyo un total numerico',
  },
  {
    nombre: 'total_positivo',
    severidad: 'bloqueante',
    comprueba: (c) => {
      const t = c['total_centavos']
      if (typeof t !== 'number') return null // ya lo dijo total_presente
      return t > 0 ? null : `total no positivo (${t})`
    },
  },
  {
    nombre: 'cuadra_con_pedido',
    severidad: 'bloqueante',
    comprueba: (c, ctx) => {
      const esperado = ctx.pedido?.total_centavos
      const leido = c['total_centavos']
      if (typeof esperado !== 'number' || typeof leido !== 'number') return null
      // Un centimo de diferencia es redondeo; un euro ya no lo es.
      const diferencia = Math.abs(esperado - leido)
      return diferencia <= 1 ? null : `el documento dice ${leido} y el pedido ${esperado}`
    },
  },
  {
    nombre: 'no_duplicado',
    severidad: 'bloqueante',
    comprueba: (c, ctx) => {
      const hash = c['hash_sha256']
      if (typeof hash !== 'string' || !ctx.hashesVistos) return null
      return ctx.hashesVistos.has(hash) ? 'este documento ya se recibio antes' : null
    },
  },
  {
    nombre: 'proveedor_coincide',
    severidad: 'aviso',
    comprueba: (c, ctx) => {
      const esperado = ctx.pedido?.proveedor
      const leido = c['proveedor']
      if (typeof esperado !== 'string' || typeof leido !== 'string') return null
      return leido.trim().toLowerCase() === esperado.trim().toLowerCase()
        ? null
        : `el documento dice "${leido}" y el pedido "${esperado}"`
    },
  },
  {
    nombre: 'fecha_razonable',
    severidad: 'aviso',
    comprueba: (c) => {
      const f = c['fecha']
      if (typeof f !== 'string') return null
      const d = new Date(f)
      if (Number.isNaN(d.getTime())) return 'la fecha no se entiende'
      const anyos = (Date.now() - d.getTime()) / (365 * 24 * 60 * 60 * 1000)
      if (anyos > 2) return `la fecha tiene ${anyos.toFixed(1)} anyos`
      if (anyos < -0.02) return 'la fecha esta en el futuro'
      return null
    },
  },
]
