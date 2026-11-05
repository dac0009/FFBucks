// The site's look: colors, fonts and wording. Defaults match the league's
// record book (warm newsprint, dark masthead, serif headlines). The
// commissioner can change any of it from the look editor; the database
// re-checks every value (supabase/migrations/202611050001_site_look.sql).

export const COLOR_FIELDS = [
  { key: 'bg', label: 'Page background', group: 'Paper' },
  { key: 'surface', label: 'Boxes and panels', group: 'Paper' },
  { key: 'surface_alt', label: 'Price buttons and inputs', group: 'Paper' },
  { key: 'rule', label: 'Lines and borders', group: 'Paper' },
  { key: 'ink', label: 'Main text', group: 'Ink' },
  { key: 'ink_soft', label: 'Secondary text', group: 'Ink' },
  { key: 'accent', label: 'Buttons and selected picks', group: 'Ink' },
  { key: 'accent_ink', label: 'Text on buttons', group: 'Ink' },
  { key: 'highlight', label: 'Highlights (prices, pot, ranks)', group: 'Ink' },
  { key: 'pos', label: 'Wins and gains', group: 'Ink' },
  { key: 'neg', label: 'Losses', group: 'Ink' },
  { key: 'masthead_bg', label: 'Masthead background', group: 'Masthead' },
  { key: 'masthead_ink', label: 'Masthead text', group: 'Masthead' },
  { key: 'masthead_rule', label: 'Masthead trim', group: 'Masthead' },
];

export const FONTS = {
  Newsreader: { stack: '"Newsreader", Georgia, "Times New Roman", serif', google: 'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,500' },
  'Playfair Display': { stack: '"Playfair Display", Georgia, serif', google: 'Playfair+Display:ital,wght@0,500;0,700;1,500' },
  'Libre Baskerville': { stack: '"Libre Baskerville", Georgia, serif', google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400' },
  'Old Standard TT': { stack: '"Old Standard TT", Georgia, serif', google: 'Old+Standard+TT:ital,wght@0,400;0,700;1,400' },
  'Libre Caslon Text': { stack: '"Libre Caslon Text", Georgia, serif', google: 'Libre+Caslon+Text:ital,wght@0,400;0,700;1,400' },
  Georgia: { stack: 'Georgia, "Times New Roman", serif', google: null },
  Inter: { stack: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif', google: 'Inter:wght@400;500;600;700' },
  'IBM Plex Sans': { stack: '"IBM Plex Sans", system-ui, sans-serif', google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  Barlow: { stack: '"Barlow", system-ui, sans-serif', google: 'Barlow:wght@400;500;600;700' },
  'Barlow Condensed': { stack: '"Barlow Condensed", "Arial Narrow", sans-serif', google: 'Barlow+Condensed:wght@500;600;700' },
  'Source Sans 3': { stack: '"Source Sans 3", system-ui, sans-serif', google: 'Source+Sans+3:wght@400;500;600;700' },
};

export const PRESETS = {
  'Record book': {
    bg: '#eee9dd', surface: '#e2d9c6', surface_alt: '#f4f0e6', rule: '#aea38e',
    ink: '#202c30', ink_soft: '#4a5754', accent: '#285568', accent_ink: '#f4efe3',
    highlight: '#8a6d37', pos: '#37634b', neg: '#9a4037',
    masthead_bg: '#202c30', masthead_ink: '#eee8da', masthead_rule: '#ab8e59',
    font_display: 'Newsreader', font_body: 'Inter',
  },
  'Broadsheet': {
    bg: '#f6f3ec', surface: '#ece6d8', surface_alt: '#fbf9f4', rule: '#9d9686',
    ink: '#111111', ink_soft: '#4b4a46', accent: '#111111', accent_ink: '#f6f3ec',
    highlight: '#6e5a2e', pos: '#2f5d3e', neg: '#8e2f25',
    masthead_bg: '#f6f3ec', masthead_ink: '#111111', masthead_rule: '#111111',
    font_display: 'Old Standard TT', font_body: 'Libre Baskerville',
  },
  'Financial pink': {
    bg: '#f2dfce', surface: '#ead3bf', surface_alt: '#f8ebdf', rule: '#b39a84',
    ink: '#262a33', ink_soft: '#55545a', accent: '#0d3b66', accent_ink: '#f8ebdf',
    highlight: '#7a4b22', pos: '#2e6b4a', neg: '#9b2d30',
    masthead_bg: '#262a33', masthead_ink: '#f2dfce', masthead_rule: '#c08a5b',
    font_display: 'Libre Caslon Text', font_body: 'IBM Plex Sans',
  },
  'Night edition': {
    bg: '#0f1a24', surface: '#162533', surface_alt: '#1d3142', rule: '#2a4053',
    ink: '#ece6d3', ink_soft: '#9fb0bf', accent: '#4fa37a', accent_ink: '#08130d',
    highlight: '#d8b24a', pos: '#4fa37a', neg: '#d2604f',
    masthead_bg: '#0f1a24', masthead_ink: '#ece6d3', masthead_rule: '#d8b24a',
    font_display: 'Barlow Condensed', font_body: 'Barlow',
  },
};

export const DEFAULT_THEME = PRESETS['Record book'];

// Every piece of wording the commissioner can change. {name} parts are filled
// in by the site; the editor lists which ones each line can use.
export const COPY = {
  'brand.kicker': { group: 'Masthead', label: 'Small line above the name', text: 'The FFBFFL' },
  'brand.name': { group: 'Masthead', label: 'Site name', text: 'FFBucks' },
  'brand.motto': { group: 'Masthead', label: 'Motto beside the name', text: 'Odds, ends and bad beats from the league’s own book.' },
  'brand.folio': { group: 'Masthead', label: 'Top strip (left)', text: 'The sportsbook edition' },
  'nav.board': { group: 'Masthead', label: 'Menu: board', text: 'The Board' },
  'nav.feed': { group: 'Masthead', label: 'Menu: feed', text: 'The Wire' },
  'nav.standings': { group: 'Masthead', label: 'Menu: standings', text: 'Standings' },
  'nav.me': { group: 'Masthead', label: 'Menu: my bets', text: 'My Ledger' },
  'nav.commish': { group: 'Masthead', label: 'Menu: commissioner', text: 'Commissioner' },
  'balance.label': { group: 'Masthead', label: 'Balance label', text: 'Your balance' },

  'signin.lede': { group: 'Sign-in', label: 'Welcome line', text: 'The league’s book. Bet play money on your friends’ matchups.' },
  'signin.join': { group: 'Sign-in', label: 'Invite code prompt', text: 'Enter the invite code from the commissioner to link this login to your team.' },
  'signin.bonus': { group: 'Sign-in', label: 'Free FFBucks note', text: 'First time joining gets you 1,000 free FFBucks.' },

  'pot.title': { group: 'The pot', label: 'Pot heading', text: 'The {season} pot' },
  'pot.sub': { group: 'The pot', label: 'Pot explanation', text: 'Every top-up this season adds 1,000. Saved to the record at season end, then starts over.' },

  'board.title': { group: 'Board', label: 'Board heading', text: 'Week {week} lines' },
  'board.intro': { group: 'Board', label: 'Board introduction', text: '{open} of {total} games open. Each game locks at the first kickoff of any player on either roster.' },
  'board.empty': { group: 'Board', label: 'No lines yet', text: 'No lines yet. They post after the Tuesday data refresh.' },
  'board.yours': { group: 'Board', label: 'Your-game tag', text: 'Your game' },
  'slip.title': { group: 'Board', label: 'Bet slip heading', text: 'Bet slip' },
  'slip.empty': { group: 'Board', label: 'Empty slip', text: 'Tap any price to add it. Add up to six games for a parlay.' },
  'slip.place': { group: 'Board', label: 'Place bet button', text: 'Place bet' },
  'slip.parlay': { group: 'Board', label: 'Place parlay button', text: 'Place parlay' },

  'feed.title': { group: 'Feed', label: 'Feed heading', text: 'The Wire' },
  'feed.intro': { group: 'Feed', label: 'Feed introduction', text: 'Every bet in the league. Tail to copy one, fade to take the other side at the same line.' },
  'feed.empty': { group: 'Feed', label: 'Empty feed', text: 'No bets here yet. Be the first on the board.' },

  'standings.title': { group: 'Standings', label: 'Standings heading', text: '{season} standings' },
  'standings.intro': { group: 'Standings', label: 'Standings introduction', text: 'Ranked by net: FFBucks won or lost on settled bets, minus top-ups this season. Topping up keeps you playing but can’t buy first place.' },
  'topup.title': { group: 'Standings', label: 'Top-up heading', text: 'Need more FFBucks?' },
  'topup.body': { group: 'Standings', label: 'Top-up explanation', text: 'Top up 1,000 any time, broke or not. It adds 1,000 to your “owed to the pot” tally and the season pot. That tally is FFBucks only, never real money.' },
  'topup.button': { group: 'Standings', label: 'Top-up button', text: 'Top up 1,000' },

  'profile.mine': { group: 'Profile', label: 'Your own ledger subtitle', text: 'Your book.' },
  'profile.theirs': { group: 'Profile', label: 'Someone else’s ledger subtitle', text: 'Everything here is public to the league.' },
  'profile.best': { group: 'Profile', label: 'Best bet heading', text: 'Best hit' },
  'profile.worst': { group: 'Profile', label: 'Worst bet heading', text: 'Worst beat' },

  'tip.button': { group: 'Footer', label: 'Tip button', text: 'Tip the commish' },
  'tip.soon': { group: 'Footer', label: 'Tip button before a link is set', text: 'Tip jar coming soon' },
};

/** Fill {name} parts; unknown parts are left as typed. */
export function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** The {name} parts a line can use, from its default wording. */
export function placeholders(key) {
  return [...new Set((COPY[key]?.text.match(/\{\w+\}/g) ?? []))];
}

export function isColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Keep only settings the site understands (mirrors the database check). */
export function cleanTheme(theme) {
  const out = {};
  for (const { key } of COLOR_FIELDS) if (isColor(theme?.[key])) out[key] = theme[key].toLowerCase();
  for (const key of ['font_display', 'font_body']) if (theme?.[key] in FONTS) out[key] = theme[key];
  return out;
}

export function cleanCopy(copy) {
  const out = {};
  for (const [key, value] of Object.entries(copy ?? {})) {
    if (key in COPY && typeof value === 'string' && value.trim() && value.length <= 500 && value !== COPY[key].text) {
      out[key] = value;
    }
  }
  return out;
}

/** Only the settings that differ from the defaults, so defaults can improve later. */
export function themeChanges(theme) {
  const clean = cleanTheme(theme);
  return Object.fromEntries(Object.entries(clean).filter(([k, v]) => DEFAULT_THEME[k] !== v));
}

// Contrast (WCAG): 4.5 is the usual minimum for reading text.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Pairs that must stay readable, with a plain description for warnings. */
export const READABLE_PAIRS = [
  ['ink', 'bg', 'Main text on the page'],
  ['ink', 'surface', 'Main text in boxes'],
  ['ink_soft', 'bg', 'Secondary text on the page'],
  ['accent_ink', 'accent', 'Button text on buttons'],
  ['masthead_ink', 'masthead_bg', 'Masthead text'],
  ['ink', 'surface_alt', 'Prices on price buttons'],
];

export function readabilityWarnings(theme) {
  const full = { ...DEFAULT_THEME, ...cleanTheme(theme) };
  return READABLE_PAIRS
    .map(([fg, bg, label]) => ({ label, ratio: contrast(full[fg], full[bg]) }))
    .filter((pair) => pair.ratio < 4.5);
}

/** CSS custom properties for a theme. */
export function cssVars(theme) {
  const full = { ...DEFAULT_THEME, ...cleanTheme(theme) };
  const vars = {};
  for (const { key } of COLOR_FIELDS) vars[`--${key.replace(/_/g, '-')}`] = full[key];
  vars['--font-display'] = FONTS[full.font_display].stack;
  vars['--font-body'] = FONTS[full.font_body].stack;
  return vars;
}

/** Google Fonts stylesheet for the chosen fonts (null if none needed). */
export function fontsHref(theme) {
  const full = { ...DEFAULT_THEME, ...cleanTheme(theme) };
  const families = [...new Set([full.font_display, full.font_body])].map((f) => FONTS[f].google).filter(Boolean);
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap` : null;
}
