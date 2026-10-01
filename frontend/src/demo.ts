import type { Bandeja, Detalle, Documento, Regla } from './tipos'

/**
 * Los datos de la demo publica. Inventados, y la pantalla lo dice.
 *
 * Elegidos para que se vea la unica decision que importa en este producto: por que un
 * documento para en la bandeja y otro no.
 *
 *   - Uno para por confianza baja aunque TODAS las reglas pasen (0.71 < 0.85).
 *   - Uno para por una regla bloqueante: el total no cuadra con el pedido.
 *   - Uno para por dos avisos a la vez. Uno solo no habria parado nada, y eso es lo
 *     que hay que poder ver de un vistazo.
 *   - Uno para por duplicado, que es el que mas dinero ahorra y el que nadie ensena.
 *   - Y la cifra de arriba dice cuantos paso la maquina sola hoy, que es el producto.
 */

/**
 * La demo se ancla al momento en que se abre, no a una fecha escrita.
 *
 * Con una fecha fija la demo envejece sola: en diciembre un turno "de hoy" sale con
 * fecha de octubre y un reintento "manyana" sale pasado hace dos meses. Una demo con
 * fechas rancias dice de la empresa exactamente lo contrario de lo que queremos.
 *
 * Redondeado a la hora en punto: un turno de 07:54 a 15:54 no existe en ningun cuadrante
 * del mundo, y ese detalle es lo primero que ve alguien que trabaja con turnos.
 */
const AHORA = Math.floor(Date.now() / 3_600_000) * 3600
const horas = (n: number) => ({ _seconds: AHORA + n * 3600 })

const DOCUMENTOS: Documento[] = [
  {
    id: 'doc_1',
    nombre_fichero: 'INV-20418.pdf',
    tipo: 'invoice',
    proveedor: 'Ardmore Packaging',
    total_centavos: 418750,
    moneda: 'EUR',
    recibido_en: horas(-5),
    confianza: 0.71,
    via: 'persona',
    estado: 'pendiente_persona',
    motivos: ['confidence 0.71 is below the 0.85 threshold'],
  },
  {
    id: 'doc_2',
    nombre_fichero: 'scan_0094.pdf',
    tipo: 'invoice',
    proveedor: 'Teiler Werkzeuge',
    total_centavos: 129900,
    moneda: 'EUR',
    recibido_en: horas(-3),
    confianza: 0.94,
    via: 'persona',
    estado: 'pendiente_persona',
    motivos: ['the document says 1,299.00 and the order says 1,199.00'],
  },
  {
    id: 'doc_3',
    nombre_fichero: 'rechnung_okt.pdf',
    tipo: 'invoice',
    proveedor: 'Brunner GmbH',
    total_centavos: 52400,
    moneda: 'EUR',
    recibido_en: horas(-2),
    confianza: 0.91,
    via: 'persona',
    estado: 'pendiente_persona',
    motivos: ['2 warnings at once: proveedor_coincide, fecha_razonable'],
  },
  {
    id: 'doc_4',
    nombre_fichero: 'INV-20390 (1).pdf',
    tipo: 'invoice',
    proveedor: 'Ardmore Packaging',
    total_centavos: 212000,
    moneda: 'EUR',
    recibido_en: horas(-1),
    confianza: 0.97,
    via: 'persona',
    estado: 'pendiente_persona',
    motivos: ['this document already arrived before'],
  },
]

const DETALLES: Record<string, Detalle> = {
  doc_1: {
    documento: DOCUMENTOS[0]!,
    pedido: { referencia: 'PO-8814', proveedor: 'Ardmore Packaging', total_centavos: 418750 },
    campos: [
      { nombre: 'Supplier', valor: 'Ardmore Packaging', confianza: 0.93 },
      { nombre: 'Invoice number', valor: 'INV-20418', confianza: 0.88 },
      { nombre: 'Date', valor: '2026-09-28', confianza: 0.95 },
      // El campo que hunde la media. Ensenar la confianza por campo y no solo la del
      // documento es lo que convierte "revisalo" en "mira esta linea".
      { nombre: 'Total', valor: '4,187.50 EUR', confianza: 0.71 },
      { nombre: 'VAT', valor: '879.38 EUR', confianza: 0.74 },
    ],
    validaciones: [
      { regla: 'total_presente', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'total_positivo', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'cuadra_con_pedido', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'no_duplicado', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'proveedor_coincide', severidad: 'aviso', resultado: 'pasa', detalle: '' },
      { regla: 'fecha_razonable', severidad: 'aviso', resultado: 'pasa', detalle: '' },
    ],
  },
  doc_2: {
    documento: DOCUMENTOS[1]!,
    pedido: { referencia: 'PO-8821', proveedor: 'Teiler Werkzeuge', total_centavos: 119900 },
    campos: [
      { nombre: 'Supplier', valor: 'Teiler Werkzeuge', confianza: 0.96 },
      { nombre: 'Invoice number', valor: '2026-4471', confianza: 0.94 },
      { nombre: 'Date', valor: '2026-09-30', confianza: 0.97 },
      { nombre: 'Total', valor: '1,299.00 EUR', confianza: 0.95 },
    ],
    validaciones: [
      { regla: 'total_presente', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'total_positivo', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      {
        regla: 'cuadra_con_pedido',
        severidad: 'bloqueante',
        resultado: 'falla',
        detalle: 'the document says 1,299.00 and the order says 1,199.00',
      },
      { regla: 'no_duplicado', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'proveedor_coincide', severidad: 'aviso', resultado: 'pasa', detalle: '' },
      { regla: 'fecha_razonable', severidad: 'aviso', resultado: 'pasa', detalle: '' },
    ],
  },
  doc_3: {
    documento: DOCUMENTOS[2]!,
    pedido: { referencia: 'PO-8702', proveedor: 'Brunner & Söhne', total_centavos: 52400 },
    campos: [
      { nombre: 'Supplier', valor: 'Brunner GmbH', confianza: 0.9 },
      { nombre: 'Invoice number', valor: 'R-10044', confianza: 0.93 },
      { nombre: 'Date', valor: '2024-03-11', confianza: 0.89 },
      { nombre: 'Total', valor: '524.00 EUR', confianza: 0.92 },
    ],
    validaciones: [
      { regla: 'total_presente', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'total_positivo', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'cuadra_con_pedido', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'no_duplicado', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      {
        regla: 'proveedor_coincide',
        severidad: 'aviso',
        resultado: 'falla',
        detalle: 'the document says "Brunner GmbH" and the order says "Brunner & Söhne"',
      },
      {
        regla: 'fecha_razonable',
        severidad: 'aviso',
        resultado: 'falla',
        detalle: 'the date is 2.6 years old',
      },
    ],
  },
  doc_4: {
    documento: DOCUMENTOS[3]!,
    pedido: { referencia: 'PO-8795', proveedor: 'Ardmore Packaging', total_centavos: 212000 },
    campos: [
      { nombre: 'Supplier', valor: 'Ardmore Packaging', confianza: 0.98 },
      { nombre: 'Invoice number', valor: 'INV-20390', confianza: 0.97 },
      { nombre: 'Date', valor: '2026-09-18', confianza: 0.98 },
      { nombre: 'Total', valor: '2,120.00 EUR', confianza: 0.97 },
    ],
    validaciones: [
      { regla: 'total_presente', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'total_positivo', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      { regla: 'cuadra_con_pedido', severidad: 'bloqueante', resultado: 'pasa', detalle: '' },
      {
        regla: 'no_duplicado',
        severidad: 'bloqueante',
        resultado: 'falla',
        detalle: 'arrived on 18 Sep as INV-20390.pdf and was paid',
      },
      { regla: 'proveedor_coincide', severidad: 'aviso', resultado: 'pasa', detalle: '' },
      { regla: 'fecha_razonable', severidad: 'aviso', resultado: 'pasa', detalle: '' },
    ],
  },
}

const REGLAS: Regla[] = [
  {
    nombre: 'total_presente',
    severidad: 'bloqueante',
    explicacion: 'A total was read, and it is a number.',
  },
  {
    nombre: 'total_positivo',
    severidad: 'bloqueante',
    explicacion: 'The total is greater than zero. A credit note is a different document.',
  },
  {
    nombre: 'cuadra_con_pedido',
    severidad: 'bloqueante',
    explicacion:
      'The total matches the purchase order within one cent. A cent is rounding; a euro is not.',
  },
  {
    nombre: 'no_duplicado',
    severidad: 'bloqueante',
    explicacion: 'This exact file has not arrived before. Catches the resent invoice.',
  },
  {
    nombre: 'proveedor_coincide',
    severidad: 'aviso',
    explicacion: 'The supplier name matches the order. Legal names and trading names differ a lot.',
  },
  {
    nombre: 'fecha_razonable',
    severidad: 'aviso',
    explicacion: 'The date is not in the future and not more than two years old.',
  },
]

const BANDEJA: Bandeja = {
  total: DOCUMENTOS.length,
  documentos: DOCUMENTOS,
  auto_hoy: 37,
  recibidos_hoy: 41,
}

export const DEMO: Record<string, unknown> = {
  '/bandeja': BANDEJA,
  '/reglas': { reglas: REGLAS, confianza_minima: 0.85 },
  ...Object.fromEntries(Object.entries(DETALLES).map(([id, d]) => [`/documentos/${id}`, d])),
}
