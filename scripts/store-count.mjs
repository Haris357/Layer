// Pulls total Microsoft Store acquisitions (installs) via the Store analytics
// API and writes the number to Firestore `stats/store`. The website reads that
// and shows a combined "site + Store" download total. Runs on a daily cron.
//
// Required env (GitHub repo secrets on Haris357/Layer):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET  — the Entra app
//   FIREBASE_SERVICE_ACCOUNT                               — same project the site uses
// Optional:
//   STORE_ID     (default 9NL577X16L1N — Layer's Store product id)
//   STORE_START  (default 2026-01-01 — a date before the Store launch)
//
// Missing config is a soft skip, never a hard failure — a bad run must never
// wipe the last good number.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const TENANT = process.env.AZURE_TENANT_ID
const CLIENT_ID = process.env.AZURE_CLIENT_ID
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET
const STORE_ID = process.env.STORE_ID || '9NL577X16L1N'
const START = process.env.STORE_START || '2026-01-01'
const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT
const HOST = 'https://manage.devcenter.microsoft.com'

function skip(msg) {
  console.log(`store-count: skipped — ${msg}`)
  process.exit(0)
}
if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) skip('AZURE_* env not set')
if (!saRaw) skip('FIREBASE_SERVICE_ACCOUNT not set')

// 1) Microsoft Entra token (client-credentials) for the Store analytics API.
const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT}/oauth2/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      resource: HOST,
    }),
  },
)
if (!tokenRes.ok) skip(`token request failed: ${tokenRes.status} ${await tokenRes.text()}`)
const token = (await tokenRes.json()).access_token
if (!token) skip('no access_token returned')

// 2) Sum daily acquisitions from launch to today, following pagination.
const end = new Date().toISOString().slice(0, 10)
let url = `${HOST}/v1.0/my/analytics/acquisitions?applicationId=${STORE_ID}&startDate=${START}&endDate=${end}&aggregationLevel=day`
let total = 0
let rows = 0
for (let page = 0; url && page < 500; page++) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) skip(`acquisitions request failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (page === 0) console.log('store-count: first-row sample:', JSON.stringify((data.Value || [])[0] ?? null))
  for (const r of data.Value || []) {
    total += Number(r.acquisitionQuantity ?? r.acquisitionsCount ?? 0)
    rows++
  }
  const next = data['@nextLink']
  url = next ? (next.startsWith('http') ? next : `${HOST}${next.startsWith('/') ? '' : '/'}${next}`) : null
}
console.log(`store-count: summed ${rows} rows → ${total} acquisitions`)

// 3) Write to Firestore (admin bypasses security rules).
const sa = JSON.parse(saRaw)
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n')
initializeApp({ credential: cert(sa) })
const db = getFirestore()
await db
  .doc('stats/store')
  .set({ count: total, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log(`store-count: wrote stats/store = ${total}`)
process.exit(0)
