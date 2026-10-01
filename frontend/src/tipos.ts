/**
 * Las formas que viajan entre el backend y las pantallas.
 *
 * El seed de la demo (src/demo.ts) se escribe contra estos mismos tipos, asi que un
 * campo que cambie en el backend rompe la compilacion de la demo -- y no la cara de
 * alguien que la abre y ve una bandeja de guiones.
 */

export type Marca = { _seconds: number }

export type Severidad = 'bloqueante' | 'aviso'

export type Validacion = {
  regla: string
  severidad: Severidad
  resultado: 'pasa' | 'falla'
  detalle: string
}

export type Campo = {
  nombre: string
  valor: string
  confianza: number
}

export type Documento = {
  id: string
  nombre_fichero: string
  tipo: 'invoice' | 'delivery_note' | 'receipt'
  proveedor: string
  total_centavos: number
  moneda: string
  recibido_en: Marca
  confianza: number
  /** `auto` no significa pagado: significa que ninguna persona necesita mirarlo. */
  via: 'auto' | 'persona'
  estado: 'pendiente_persona' | 'aprobado' | 'rechazado' | 'auto_aprobado'
  motivos: string[]
}

export type Detalle = {
  documento: Documento
  campos: Campo[]
  validaciones: Validacion[]
  /** El pedido con el que se compara, cuando lo hay. */
  pedido?: { referencia: string; proveedor: string; total_centavos: number }
}

export type Bandeja = {
  total: number
  documentos: Documento[]
  /** Lo que la maquina resolvio sola desde medianoche. Es el ahorro, y hay que verlo. */
  auto_hoy: number
  recibidos_hoy: number
}

export type Regla = {
  nombre: string
  severidad: Severidad
  explicacion: string
}
