import { createLucideIcon } from 'lucide-react'

// Toolbar icon for Desktop Pebbles, drawn in Lucide's 24px stroke style so it
// sits with the other widget icons: the lopsided pebble, two ◠ eyes and a
// small sparkle.
export const PebbleIcon = createLucideIcon('Pebble', [
  ['path', { d: 'M5.2 7.3C7.2 4.3 14.6 3.1 18.6 5c3.5 1.9 3.1 8.5.9 12.3-2.4 4-8.3 5.6-11.9 3.7C4 19.3 2 14.6 2.5 11.3c.2-1.7 1.2-3 2.7-4Z', key: 'body' }],
  ['path', { d: 'M10.6 10.6c.5-1.4 2.2-1.4 2.7 0', key: 'eye-l' }],
  ['path', { d: 'M15 10.6c.5-1.4 2.2-1.4 2.7 0', key: 'eye-r' }],
  ['path', { d: 'M7.6 14.2v2.8M6.2 15.6H9', key: 'spark' }],
])
