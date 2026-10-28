// Everything you are likely to edit lives here.

// Fallback stream address, used only if live.json cannot be read. Normally leave this empty
// and set the addresses in static/live.json instead. Can also be set with PUBLIC_STREAM_URL.
export const STREAM_URL = import.meta.env.PUBLIC_STREAM_URL ?? '';

// Where the site asks which source to use. Set PUBLIC_SWITCH_URL to the admin service,
// e.g. https://switch.gaafu.tv/live.json. Defaults to the static file static/live.json.
export const SWITCH_FILE = import.meta.env.PUBLIC_SWITCH_URL ?? '/live.json';

export const SITE_URL = 'https://www.gaafu.tv';
export const TIMEZONE = 'Indian/Maldives';

// Daily programme guide in Maldives time (MVT, UTC+5).
export const GUIDE = [
  { t: '06:00', name: 'Morning Bulletin' },
  { t: '09:00', name: 'Atoll Report' },
  { t: '12:00', name: 'Midday News' },
  { t: '15:00', name: 'Gaafu Live' },
  { t: '18:00', name: 'Khabaru Vaguvee' },
  { t: '21:00', name: 'Late Edition' },
  { t: '23:30', name: 'Overnight' }
];
