// Release-announcement email — same clean, light design as the welcome mail
// the site sends on first download. Used by scripts/announce.mjs.

const LINKS = {
  download:
    'https://github.com/Haris357/Layer-releases/releases/latest/download/Layer-Setup.exe',
  changelog: 'https://layer-web-eta.vercel.app/changelog',
  repo: 'https://github.com/Haris357/Layer-releases',
  portfolio: 'https://harisjangdaa.web.app/',
  linkedin: 'https://www.linkedin.com/in/harisjangda/',
  github: 'https://github.com/haris357',
  twitter: 'https://x.com/HarisMImran',
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = '#111111'
const MUTED = '#66666b'
const FAINT = '#9a9aa0'
const LINE = '#ececec'

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Inline markdown: **bold**, `code`, [text](url). Run AFTER escaping.
function inline(s) {
  return esc(s)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      `<a href="$2" style="color:${INK};font-weight:600;text-decoration:none;">$1</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${INK};">$1</strong>`)
    .replace(
      /`([^`]+)`/g,
      `<code style="background:#f4f4f5;border:1px solid ${LINE};border-radius:5px;padding:1px 5px;font-size:13px;">$1</code>`,
    )
}

// Turns the RELEASE_NOTES.md body into email-safe HTML. Supports headings
// (#, ##), bullet lists (-, *) and plain paragraphs — enough for a clean
// "what's new / fixes" note.
export function notesToHtml(md) {
  const lines = String(md || '')
    .replace(/<!--[\s\S]*?-->/g, '') // drop instructional HTML comments
    .replace(/\r\n/g, '\n')
    .split('\n')
  const out = []
  let bullets = []

  const flush = () => {
    if (!bullets.length) return
    out.push(
      `<ul style="margin:8px 0 0;padding-left:20px;color:${MUTED};font-size:15px;line-height:1.7;">` +
        bullets.map((b) => `<li style="margin:2px 0;">${inline(b)}</li>`).join('') +
        `</ul>`,
    )
    bullets = []
  }

  for (const raw of lines) {
    const t = raw.trim()
    if (!t) {
      flush()
      continue
    }
    if (/^#{1,6}\s+/.test(t)) {
      flush()
      const text = t.replace(/^#{1,6}\s+/, '')
      out.push(
        `<div style="margin:22px 0 2px;font-size:15px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${inline(
          text,
        )}</div>`,
      )
    } else if (/^[-*]\s+/.test(t)) {
      bullets.push(t.replace(/^[-*]\s+/, ''))
    } else {
      flush()
      out.push(
        `<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${MUTED};">${inline(
          t,
        )}</p>`,
      )
    }
  }
  flush()
  return out.join('\n')
}

export function announceEmail({ version, notesHtml }) {
  const v = String(version).replace(/^v/, '')
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f4f4f5;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="540" cellpadding="0" cellspacing="0"
            style="max-width:540px;width:100%;background:#ffffff;border:1px solid ${LINE};
            border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:40px 44px 8px;font-family:${FONT};">
                <div style="font-size:19px;font-weight:700;letter-spacing:-0.6px;color:${INK};">
                  Layer
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 44px 0;font-family:${FONT};">
                <div style="font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${FAINT};">
                  New update
                </div>
                <div style="margin-top:6px;font-size:26px;font-weight:700;letter-spacing:-1.1px;color:${INK};">
                  Layer ${esc(v)} is here&nbsp;✨
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 44px 0;font-family:${FONT};">
                <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">
                  Hey — Haris here. I just shipped a new version of Layer. If
                  you've already got it installed, it'll update itself the next
                  time you open it. Here's what's new:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 44px 0;font-family:${FONT};">
                ${notesHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 44px 0;font-family:${FONT};">
                <a href="${LINKS.download}"
                  style="display:inline-block;background:${INK};color:#ffffff;
                  text-decoration:none;font-size:14px;font-weight:600;
                  padding:13px 26px;border-radius:11px;">
                  Get the latest Layer
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 44px 0;">
                <div style="border-top:1px solid ${LINE};"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 44px 0;font-family:${FONT};">
                <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">
                  See the full history on the
                  <a href="${LINKS.changelog}" style="color:${INK};font-weight:600;text-decoration:none;">
                    changelog</a>, and if Layer's earning its place on your
                  desktop a
                  <a href="${LINKS.repo}" style="color:${INK};font-weight:600;text-decoration:none;">
                    star on GitHub</a>
                  would mean a lot.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 44px 0;font-family:${FONT};">
                <p style="margin:0;font-size:13px;color:${FAINT};">Find me around the web</p>
                <p style="margin:7px 0 0;font-size:14px;">
                  <a href="${LINKS.portfolio}" style="color:${MUTED};text-decoration:none;">Portfolio</a>
                  &nbsp;·&nbsp;
                  <a href="${LINKS.linkedin}" style="color:${MUTED};text-decoration:none;">LinkedIn</a>
                  &nbsp;·&nbsp;
                  <a href="${LINKS.github}" style="color:${MUTED};text-decoration:none;">GitHub</a>
                  &nbsp;·&nbsp;
                  <a href="${LINKS.twitter}" style="color:${MUTED};text-decoration:none;">X</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 44px 40px;font-family:${FONT};">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${FAINT};">
                  You're getting this because you downloaded Layer from our
                  website. — made with care by Haris.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
