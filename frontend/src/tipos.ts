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
  /**
   * Opcional a proposito.
   *
   * La extraccion guarda una confianza por documento, no por campo. Repartir la del
   * documento entre los campos pintaria un 71% al lado de un proveedor que se leyo
   * perfectamente, y entonces el numero deja de servir justo cuando mas falta hace.
   * Sin valor, la pantalla no pinta la pastilla.
   */
  confianza?: number
}

export type Documento = {
  id: string
  nombre_fichero: string
  tipo: 'invoice' | 'delivery_note' | 'receipt'
  proveedor: string
  /** Vacio cuando la extraccion no lo leyo. Un total inventado es dinero de alguien. */
  total_centavos?: number
  moneda: string
  recibido_en: Marca
  confianza?: number
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
