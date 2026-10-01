import { useEffect, useState } from 'react'
import { api, ErrorApi } from './api'
import { AvisoDemo, Dato, Estado as Pastilla, Marco, Panel, Pestanas, Tabla, Tarjeta } from './piezas'
import type { Bandeja, Detalle, Regla, Validacion } from './tipos'

/**
 * El panel de Doc Intake.
 *
 * El producto no es leer facturas: eso lo hace cualquiera. El producto es decidir cuales
 * NO necesitan que nadie las mire, y explicar sin que te lo pidan por que las demas si.
 *
 * Por eso la pantalla abre con dos numeros juntos -- cuantas llegaron hoy y cuantas pasaron
 * solas -- y por eso cada documento de la bandeja trae escrito el motivo por el que esta
 * ahi. Una bandeja sin motivos obliga a revisar el documento entero para averiguar que
 * tenia de raro, que es justo el trabajo que este producto existe para quitar.
 */

const VISTAS = [
  ['bandeja', 'Needs a person'],
  ['reglas', 'Rules'],
] as const

type Vista = (typeof VISTAS)[number][0]

function cuando(t?: { _seconds?: number }) {
  if (!t?._seconds) return '—'
  return new Date(t._seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dinero(centavos: number | undefined, moneda = 'EUR') {
  // Un guion y no un cero: un cero es una cifra y se lee como tal.
  if (centavos === undefined) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: moneda }).format(
    centavos / 100,
  )
}

/**
 * La confianza, con el umbral dentro.
 *
 * Un 0.71 suelto no dice nada a nadie. Un 0.71 en rojo al lado de un 0.94 en verde dice
 * exactamente donde esta el problema sin leer una linea de documentacion.
 */
function Confianza({ valor, minima = 0.85 }: { valor: number | undefined; minima?: number }) {
  // Sin confianza guardada no se pinta nada. Un 0% seria mentira y un 100% peor.
  if (valor === undefined) return null
  return (
    <Pastilla tipo={valor >= minima ? 'bien' : 'mal'}>{Math.round(valor * 100)}%</Pastilla>
  )
}

function useCarga<T>(ruta: string | null, token: string) {
  const [dato, setDato] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(ruta !== null)

  useEffect(() => {
    if (!ruta) {
      setDato(undefined)
      setCargando(false)
      return
    }
    let vivo = true
    setCargando(true)
    setError(null)
    ;(async () => {
      try {
        const r = await api<T>(ruta, { token })
        if (vivo) setDato(r)
      } catch (e) {
        if (vivo) setError(e instanceof ErrorApi ? e.message : 'Could not reach the server.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [ruta, token])

  return { dato, error, cargando }
}

function Fallo({ texto }: { texto: string }) {
  return (
    <div className="error" style={{ marginTop: 'var(--hueco)' }}>
      <strong>{texto}</strong>
      <p style={{ margin: '8px 0 0' }}>
        <button className="boton secundario" onClick={() => location.reload()}>
          Try again
        </button>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ pantallas */

function BandejaVista({ token, abre }: { token: string; abre: (id: string) => void }) {
  const { dato, error, cargando } = useCarga<Bandeja>('/bandeja', token)
  const auto = dato ? Math.round((dato.auto_hoy / Math.max(dato.recibidos_hoy, 1)) * 100) : 0

  return (
    <>
      <h1>Needs a person</h1>
      <p style={{ color: 'var(--tinta-suave)', maxWidth: '58ch' }}>
        Everything that arrived today and could be settled without a human already has been.
        What is left is below, each one with the reason it stopped here.
      </p>

      {error && <Fallo texto={error} />}

      <div className="fila" style={{ alignItems: 'stretch', marginTop: 'var(--hueco-l)' }}>
        <Tarjeta titulo="Waiting for you">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
              color: dato && dato.total > 0 ? 'var(--aviso)' : 'var(--tinta)',
            }}
          >
            {cargando ? '—' : (dato?.total ?? 0)}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            documents, oldest first
          </p>
        </Tarjeta>

        <Tarjeta titulo="Handled without you today">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
              color: 'var(--bien)',
            }}
          >
            {cargando ? '—' : `${auto}%`}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            {dato?.auto_hoy ?? 0} of {dato?.recibidos_hoy ?? 0} documents received today
          </p>
        </Tarjeta>

        <Tarjeta titulo="Where the line is">
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Below <strong>85% confidence</strong> a person looks at it, even when every rule
            passes. Approving a misread invoice costs money; checking a correct one costs
            thirty seconds.
          </p>
        </Tarjeta>
      </div>

      <h2 style={{ marginTop: 'var(--hueco-l)' }}>The queue</h2>
      <div style={{ marginTop: 'var(--hueco-s)' }}>
        <Tabla
          columnas={['Document', 'Supplier', 'Total', 'Confidence', 'Why it stopped', 'Arrived', '']}
          filas={dato?.documentos}
          cargando={cargando}
          error={null}
          vacio="Nothing is waiting. Everything that arrived went through on its own."
          fila={(d) => (
            <tr key={d.id}>
              <td style={{ fontFamily: 'var(--fuente-titular)' }}>{d.nombre_fichero}</td>
              <td>{d.proveedor}</td>
              <td className="cifra">{dinero(d.total_centavos, d.moneda)}</td>
              <td>
                <Confianza valor={d.confianza} />
              </td>
              {/* El motivo, en la fila. Sin esto hay que abrir cada documento para
                  averiguar que tenia de raro, que es el trabajo que veniamos a quitar. */}
              <td style={{ maxWidth: '26ch' }}>{d.motivos[0] ?? '—'}</td>
              <td className="cifra">{cuando(d.recibido_en)}</td>
              <td>
                <button className="boton secundario" onClick={() => abre(d.id)}>
                  Open
                </button>
              </td>
            </tr>
          )}
        />
      </div>
    </>
  )
}

function ReglasVista({ token }: { token: string }) {
  const { dato, error, cargando } = useCarga<{ reglas: Regla[]; confianza_minima: number }>(
    '/reglas',
    token,
  )

  return (
    <>
      <h1>Rules</h1>
      <p style={{ color: 'var(--tinta-suave)', maxWidth: '58ch' }}>
        A <strong>blocking</strong> rule sends the document to a person on its own. A{' '}
        <strong>warning</strong> does not — two warnings at once do. One oddity on its own
        would stop almost everything, and then nothing would be automatic.
      </p>
      {error && <Fallo texto={error} />}
      <div style={{ marginTop: 'var(--hueco-l)' }}>
        <Tabla
          columnas={['Rule', 'Severity', 'What it checks']}
          filas={dato?.reglas}
          cargando={cargando}
          error={null}
          vacio="No rules configured."
          fila={(r) => (
            <tr key={r.nombre}>
              <td style={{ fontFamily: 'var(--fuente-titular)' }}>{r.nombre}</td>
              <td>
                <Pastilla tipo={r.severidad === 'bloqueante' ? 'mal' : 'aviso'}>
                  {r.severidad === 'bloqueante' ? 'blocking' : 'warning'}
                </Pastilla>
              </td>
              <td>{r.explicacion}</td>
            </tr>
          )}
        />
      </div>
      <p style={{ marginTop: 'var(--hueco)', color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
        Confidence threshold: <strong>{Math.round((dato?.confianza_minima ?? 0.85) * 100)}%</strong>.
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ detalle */

function Regla1({ v }: { v: Validacion }) {
  const paso = v.resultado === 'pasa'
  return (
    <li>
      <time>{v.severidad === 'bloqueante' ? 'blocking' : 'warning'}</time>
      <span>
        <Pastilla tipo={paso ? 'bien' : v.severidad === 'bloqueante' ? 'mal' : 'aviso'}>
          {v.regla}
        </Pastilla>
        {v.detalle && <span style={{ color: 'var(--tinta-suave)' }}> · {v.detalle}</span>}
      </span>
    </li>
  )
}

function DetalleDocumento({ id, token, cierra }: { id: string; token: string; cierra: () => void }) {
  const { dato, error, cargando } = useCarga<Detalle>(`/documentos/${id}`, token)
  const [decidido, setDecidido] = useState<'aprobado' | 'rechazado' | null>(null)

  return (
    <Panel titulo={dato?.documento.nombre_fichero ?? 'Document'} onCerrar={cierra}>
      {cargando && <div className="cargando">Loading…</div>}
      {error && <div className="error">{error}</div>}
      {dato && (
        <>
          <div className="fila">
            <Dato etiqueta="Supplier">{dato.documento.proveedor}</Dato>
            <Dato etiqueta="Total">
              {dinero(dato.documento.total_centavos, dato.documento.moneda)}
            </Dato>
          </div>
          {dato.pedido && (
            <Dato etiqueta="Matched against">
              {dato.pedido.referencia} · {dinero(dato.pedido.total_centavos)}
            </Dato>
          )}

          <div>
            <p className="etiqueta" style={{ margin: '0 0 6px' }}>
              What was read, and how sure
            </p>
            <ol className="escalera">
              {dato.campos.map((c) => (
                <li key={c.nombre}>
                  <time>{c.nombre}</time>
                  <span>
                    {c.valor} <Confianza valor={c.confianza} />
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="etiqueta" style={{ margin: '0 0 6px' }}>
              Rules
            </p>
            <ol className="escalera">
              {dato.validaciones.map((v) => (
                <Regla1 key={v.regla} v={v} />
              ))}
            </ol>
          </div>

          {decidido ? (
            // Una decision no se reescribe, se anyade otra. Decirlo aqui evita la
            // pregunta de "¿y si me he equivocado?" por correo una semana despues.
            <div className="aviso-demo" style={{ margin: 0 }}>
              <strong>{decidido === 'aprobado' ? 'Approved.' : 'Rejected.'}</strong> A decision is
              never overwritten — a correction is recorded as a second one, with who and when.
            </div>
          ) : (
            <div className="fila">
              <button className="boton" onClick={() => setDecidido('aprobado')}>
                Approve
              </button>
              <button className="boton peligro" onClick={() => setDecidido('rechazado')}>
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ app */

export default function App() {
  const [vista, setVista] = useState<Vista>('bandeja')
  const [abierto, setAbierto] = useState<string | null>(null)

  const token = new URLSearchParams(location.search).get('t') ?? ''

  return (
    <Marco
      nombre="Doc Intake"
      nav={<Pestanas vistas={VISTAS} activa={vista} onCambio={setVista} />}
    >
      <AvisoDemo>
        Four invented invoices, each stopped for a different reason: low confidence, a total
        that does not match the order, two warnings at once, and a duplicate.
      </AvisoDemo>

      <div className="con-detalle">
        <div>
          {vista === 'bandeja' && <BandejaVista token={token} abre={setAbierto} />}
          {vista === 'reglas' && <ReglasVista token={token} />}
        </div>
        {abierto && <DetalleDocumento id={abierto} token={token} cierra={() => setAbierto(null)} />}
      </div>
    </Marco>
  )
}
