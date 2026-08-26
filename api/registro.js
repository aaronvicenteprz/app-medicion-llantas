import { JWT } from 'google-auth-library'

const RANGO_HOJA = 'Mediciones!A:L'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' })
    return
  }

  const { filas } = req.body ?? {}
  if (!Array.isArray(filas) || filas.length === 0) {
    res.status(400).json({ error: 'Se requiere un arreglo "filas" no vacio' })
    return
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const sheetId = process.env.GOOGLE_SHEET_ID

  if (!email || !key || !sheetId) {
    console.error('Faltan variables de entorno de Google Sheets')
    res.status(500).json({ error: 'Configuracion del servidor incompleta' })
    return
  }

  try {
    const auth = new JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const client = await auth.getClient()

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      RANGO_HOJA,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

    await client.request({
      url,
      method: 'POST',
      data: { values: filas },
    })

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error al escribir en Google Sheets:', err)
    res.status(502).json({ error: 'No se pudo guardar en la hoja de calculo' })
  }
}
