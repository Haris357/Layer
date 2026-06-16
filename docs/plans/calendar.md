# Plan: External calendars (iCal/Proton/Google) for the Calendar widget

## Current state
- `CalendarEvent` (`eventsStore.ts:14-24`) is local-only, persisted to `layer-events`.
  Rendering reads one flat array (`CalendarWidget.tsx:628` → `eventsOnDay`,
  `calendar.ts:76`). Color is a fixed enum.
- **Auth is email-OTP, NOT Google.** Backend mints a Firebase custom token
  (`email-api/api/verify-otp.js:77`), client `signInWithCustomToken`
  (`syncStore.ts:156`). No `GoogleAuthProvider`/OAuth anywhere → **no Google token
  to reuse**; Google Calendar needs a fresh OAuth flow.
- Networking solved: `@tauri-apps/plugin-http` `tauriFetch` (CORS-free), capability
  already allows all https (`capabilities/default.json:19-22`). Pattern at
  `syncStore.ts:62-64`.
- No deep-link/loopback plumbing exists (`open_url` just shells `start`).

## Data model (shared foundation)
New persisted store `calendarSourcesStore.ts`:
`CalendarSource { id, kind:'ical'|'google', label, color, enabled, url?, refreshToken?, calendarId?, lastFetched?, lastError? }`.
Extend `CalendarEvent` (additive): `sourceId?`, `readOnly?`.
Add a **non-persisted** `externalEvents` slice in `eventsStore` (rebuilt each refresh,
never written to localStorage or Firestore): `setExternalEventsForSource(id, events)`.
Merge `events + externalEvents` at the read site in the widget; `eventsOnDay` works
unchanged. `EventEditor` (`CalendarWidget.tsx:419`) becomes read-only for external events.
Refresh hook `useCalendarSources.ts` (15–30 min interval, mirror `WeatherWidget.tsx:73`).

## Build order
### 1. iCal/.ics URL — BUILD FIRST (easiest, covers Proton + Outlook too)
User pastes a public/secret `.ics` URL → `tauriFetch(url)` (no CORS) → parse → expand
recurrences into the visible window → `externalEvents`.
- Parser: add `ical.js` (handles TZID/RRULE/EXDATE correctly). New `lib/ical.ts`:
  `parseIcs(text, windowStart, windowEnd, source): CalendarEvent[]`.
- **Expand** recurring VEVENTs into concrete dated instances (`recurrence:'none'`) —
  do NOT map RRULE onto the app's 5-value enum.
- UI: a "Calendars" tab in `SettingsModal` (mirror `SyncTab.tsx`) to add/manage sources
  + a subtle source legend in the widget. Manual "Refresh now" + ~30 min auto.

### 2. Proton — zero extra code: it's only reachable via its **share-link `.ics` URL**,
so it folds into the iCal path. Document: "Proton → Share → copy link." (Outlook same.)

### 3. Google Calendar — BUILD SECOND (needs real OAuth)
- OAuth 2.0 **Authorization Code + PKCE via system browser + loopback redirect**
  (RFC 8252). Register a Desktop OAuth client; scope `calendar.readonly`.
- New Rust piece: loopback listener — recommend the `tauri-plugin-oauth` community
  plugin (or hand-write a 127.0.0.1 random-port server + command). Open consent URL
  via existing `open_url`. Validate `state`.
- Token exchange + API calls via `tauriFetch`. **Lower-risk alternative:** route the
  token exchange/refresh through the existing `email-api` backend so the client_secret
  stays server-side (mirrors the OTP→custom-token pattern).
- Fetch: `GET calendar/v3/calendars/{id}/events?singleEvents=true&orderBy=startTime`
  with timeMin/timeMax (Google expands recurrences server-side). Map → CalendarEvent
  (readOnly, source color). On 401 → refresh token → retry.
- Store refresh token in the sources store (localStorage, same trust as Firebase
  session today; note as a risk). Access token in memory only.

## Files
Add: `calendarSourcesStore.ts`, `lib/ical.ts`, `lib/googleCalendar.ts`,
`useCalendarSources.ts`, `CalendarsTab.tsx`, Rust loopback support.
Change: `eventsStore.ts` (sourceId/readOnly + external slice), `CalendarWidget.tsx`
(merged selector + read-only editor), `useCalendarReminders.ts:27` (optional include),
`SettingsModal.tsx` (register tab), `package.json` (+ical.js).

## Risks
Google desktop client_secret is extractable (prefer backend exchange); refresh-token
storage; loopback is the only viable redirect (no deep-link registered); **SSRF** —
restrict `.ics` fetch to https, reject file:// / localhost / private IPs; scope =
readonly; Google quotas (cap refresh, fetch only visible window).
