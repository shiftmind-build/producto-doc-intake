import { describe, expect, it } from 'vitest'
import { CONFIANZA_MINIMA, REGLAS_BASE, decide, evalua, type Regla } from '../../motor/triaje.js'

/**
 * El triaje. Lo que se prueba aqui es la frase que se le vende al cliente:
 *
 *   "Solo te molestamos con lo que no cuadra."
 *
 * Asi que los casos que importan no son los felices. Son los dos errores, y no cuestan
 * lo mismo: molestar de mas son treinta segundos de alguien; aprobar de menos es dinero
 * saliendo de la cuenta. Cada test de abajo defiende ese desequilibrio.
 */

const factura = (extra: Record<string, unknown> = {}) => ({
  total_centavos: 12500,
  proveedor: 'Northgate Supplies',
  fecha: new Date().toISOString().slice(0, 10),
  hash_sha256: 'abc123',
  ...extra,
})

const pedido = { total_centavos: 12500, proveedor: 'Northgate Supplies' }

const decidir = (campos: Record<string, unknown>, confianza: number, ctx = { pedido }) =>
  decide(evalua(REGLAS_BASE, campos, ctx), confianza)

describe('triaje de documentos', () => {
  it('lo que cuadra y viene con confianza alta no molesta a nadie', () => {
    const d = decidir(factura(), 0.97)
    expect(d.via).toBe('auto')
    expect(d.motivos).toEqual([])
  })

  it('un total que no cuadra con el pedido siempre va a una persona', () => {
    const d = decidir(factura({ total_centavos: 19500 }), 0.99)
    expect(d.via).toBe('persona')
    expect(d.motivos.join(' ')).toContain('cuadra_con_pedido')
  })

  it('la confianza alta NO tapa una regla bloqueante', () => {
    // El caso caro: el modelo segurisimo de un numero equivocado.
    const d = decidir(factura({ total_centavos: -400 }), 1)
    expect(d.via).toBe('persona')
  })

  it('un documento perfecto con confianza baja tambien va a una persona', () => {
    const d = decidir(factura(), CONFIANZA_MINIMA - 0.01)
    expect(d.via).toBe('persona')
    expect(d.motivos.join(' ')).toContain('confianza')
  })

  it('justo en el umbral pasa; un pelo por debajo, no', () => {
    expect(decidir(factura(), CONFIANZA_MINIMA).via).toBe('auto')
    expect(decidir(factura(), CONFIANZA_MINIMA - 0.001).via).toBe('persona')
  })

  it('un aviso suelto no para el documento', () => {
    // Nombre del proveedor distinto pero todo lo demas correcto. Si cada rareza parase
    // un documento, la bandeja se llenaria y se aprobaria en bloque sin mirar.
    const d = decidir(factura({ proveedor: 'Northgate Supplies Ltd.' }), 0.97)
    expect(d.via).toBe('auto')
  })

  it('dos avisos a la vez ya no son una rareza', () => {
    const d = decidir(
      factura({ proveedor: 'Otra Empresa', fecha: '2021-01-01' }),
      0.97,
    )
    expect(d.via).toBe('persona')
    expect(d.motivos.join(' ')).toContain('avisos a la vez')
  })

  it('el mismo documento dos veces se detecta', () => {
    const ctx = { pedido, hashesVistos: new Set(['abc123']) }
    const d = decide(evalua(REGLAS_BASE, factura(), ctx), 0.99)
    expect(d.via).toBe('persona')
    expect(d.motivos.join(' ')).toContain('no_duplicado')
  })

  it('un centimo de diferencia es redondeo, un euro no', () => {
    expect(decidir(factura({ total_centavos: 12501 }), 0.99).via).toBe('auto')
    expect(decidir(factura({ total_centavos: 12600 }), 0.99).via).toBe('persona')
  })

  it('si no se leyo el total, va a una persona aunque el modelo este seguro', () => {
    const d = decidir(factura({ total_centavos: undefined }), 1)
    expect(d.via).toBe('persona')
    expect(d.motivos.join(' ')).toContain('total_presente')
  })

  it('sin pedido con el que comparar, no se inventa un fallo', () => {
    // Un documento que llega sin pedido asociado no es un documento incorrecto.
    const d = decide(evalua(REGLAS_BASE, factura(), {}), 0.97)
    expect(d.via).toBe('auto')
  })

  it('deja por escrito cada regla que corrio, pasara o no', () => {
    const d = decidir(factura({ total_centavos: 19500 }), 0.5)
    expect(d.validaciones).toHaveLength(REGLAS_BASE.length)
    expect(d.validaciones.every((v) => v.detalle.length > 0)).toBe(true)
    // Dos motivos distintos: la regla y la confianza. Un solo mensaje generico
    // esconderia que habia dos cosas mal.
    expect(d.motivos.length).toBeGreaterThanOrEqual(2)
  })

  it('un cliente puede anyadir sus propias reglas', () => {
    const suya: Regla = {
      nombre: 'limite_de_gasto',
      severidad: 'bloqueante',
      comprueba: (c) =>
        typeof c['total_centavos'] === 'number' && c['total_centavos'] > 100000
          ? 'por encima del limite de aprobacion automatica'
          : null,
    }
    const reglas = [...REGLAS_BASE, suya]
    const barata = decide(evalua(reglas, factura(), { pedido }), 0.99)
    const cara = decide(evalua(reglas, factura({ total_centavos: 250000 }), {}), 0.99)
    expect(barata.via).toBe('auto')
    expect(cara.via).toBe('persona')
  })
})
