// Emails everyone on the download list about a new release.
//
//   node scripts/announce.mjs v1.3.0 [path/to/notes.md]
//
// Reads the address list from Firestore (admin), renders the announcement
// from RELEASE_NOTES.md using the shared email template, and sends ONE email
// PER recipient via Gmail — each with its own personalized one-click
// unsubscribe link (so we can't blast people who opted out, and recipients
// aren't BCC'd together). Anyone with `unsubscribed: true` is skipped.
// Designed to run from the release workflow, but safe to run by hand. Missing
// config is a skip, never a hard failure — a release must never break just
// because the mailout isn't set up.
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import nodemailer from 'nodemailer'
import { announceEmail, notesToHtml } from './email-template.mjs'

// Where the /unsubscribe page lives (Firebase Hosting).
const SITE = 'https://layer-desktop.web.app'

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

// Collect unique, well-formed addresses — skipping anyone who unsubscribed.
const snap = await db.collection('emails').get()
const seen = new Set()
let optedOut = 0
for (const doc of snap.docs) {
  const d = doc.data()
  if (d.unsubscribed === true) {
    optedOut++
    continue
  }
  const e = String(d.email || '')
    .trim()
    .toLowerCase()
  if (e && e.includes('@')) seen.add(e)
}
const recipients = [...seen]
console.log(
  `announce: ${recipients.length} recipient(s), ${optedOut} unsubscribed (skipped)`,
)
if (!recipients.length) skip('no recipients on the list')

const notesHtml = notesToHtml(notesMd)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: smtpUser, pass: smtpPass },
})

// One message per recipient so each gets a personalized unsubscribe link.
let sent = 0
for (const email of recipients) {
  const unsubscribeUrl = `${SITE}/unsubscribe?e=${encodeURIComponent(email)}`
  try {
    await transporter.sendMail({
      from: `"Layer" <${smtpUser}>`,
      to: email,
      subject: `Layer ${version} — what's new`,
      html: announceEmail({ version, notesHtml, unsubscribeUrl }),
      // Gmail/Outlook surface a native unsubscribe button from this header.
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    })
    sent++
  } catch (err) {
    console.warn(`announce: failed for one recipient — ${err.message}`)
  }
}

console.log(`announce: done — sent to ${sent}/${recipients.length} for v${version}`)
process.exit(0)
