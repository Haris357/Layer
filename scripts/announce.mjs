// Emails everyone on the download list about a new release.
//
//   node scripts/announce.mjs v1.3.0 [path/to/notes.md]
//
// Reads the address list from Firestore (admin), renders the announcement
// from RELEASE_NOTES.md using the shared email template, and sends one BCC
// blast per batch via Gmail. Designed to run from the release workflow, but
// safe to run by hand. Missing config is a skip, never a hard failure — a
// release must never break just because the mailout isn't set up.
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import nodemailer from 'nodemailer'
import { announceEmail, notesToHtml } from './email-template.mjs'

const BATCH = 400 // recipients per BCC message (Gmail caps ~500)

function skip(msg) {
  console.log(`announce: skipped — ${msg}`)
  process.exit(0)
}

const version = (process.argv[2] || process.env.GITHUB_REF_NAME || '').replace(
  /^v/,
  '',
)
if (!version) skip('no version given')

const notesPath = process.argv[3] || 'RELEASE_NOTES.md'
let notesMd = ''
try {
  notesMd = readFileSync(notesPath, 'utf8').trim()
} catch {
  skip(`no notes file at ${notesPath}`)
}
if (!notesMd) skip('release notes are empty')

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
if (!saRaw) skip('FIREBASE_SERVICE_ACCOUNT not set')
if (!smtpUser || !smtpPass) skip('SMTP_USER / SMTP_PASS not set')

let sa
try {
  sa = JSON.parse(saRaw)
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n')
} catch {
  skip('FIREBASE_SERVICE_ACCOUNT is not valid JSON')
}

initializeApp({ credential: cert(sa) })
const db = getFirestore()

// Collect unique, well-formed addresses.
const snap = await db.collection('emails').get()
const seen = new Set()
for (const doc of snap.docs) {
  const e = String(doc.data().email || '')
    .trim()
    .toLowerCase()
  if (e && e.includes('@')) seen.add(e)
}
const recipients = [...seen]
if (!recipients.length) skip('no recipients on the list')

const html = announceEmail({ version, notesHtml: notesToHtml(notesMd) })
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: smtpUser, pass: smtpPass },
})

let sent = 0
for (let i = 0; i < recipients.length; i += BATCH) {
  const batch = recipients.slice(i, i + BATCH)
  await transporter.sendMail({
    from: `"Layer" <${smtpUser}>`,
    to: smtpUser, // visible recipient = us; everyone else is BCC'd
    bcc: batch,
    subject: `Layer ${version} — what's new`,
    html,
  })
  sent += batch.length
  console.log(`announce: sent batch of ${batch.length} (${sent}/${recipients.length})`)
}

console.log(`announce: done — ${sent} recipient(s) for v${version}`)
process.exit(0)
