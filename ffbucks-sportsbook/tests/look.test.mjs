import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  COLOR_FIELDS, COPY, DEFAULT_THEME, FONTS, PRESETS, cleanCopy, cleanTheme, contrast, cssVars, fill, fontsHref,
  placeholders, readabilityWarnings, themeChanges,
} from '../src/lib/look.mjs';

const sql = readFileSync(new URL('../supabase/migrations/202611050001_site_look.sql', import.meta.url), 'utf8');

test('the site and the database agree on what can be changed', () => {
  for (const { key } of COLOR_FIELDS) assert.match(sql, new RegExp(`'${key}'`), `color ${key} missing from the database check`);
  for (const font of Object.keys(FONTS)) assert.ok(sql.includes(`'${font}'`), `font ${font} missing from the database check`);
  for (const key of Object.keys(COPY)) assert.match(key, /^[a-z][a-z0-9_.]{0,60}$/);
  assert.ok(Object.keys(COPY).length <= 200);
});

test('every preset is complete and readable', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const { key } of COLOR_FIELDS) assert.match(preset[key], /^#[0-9a-f]{6}$/, `${name}.${key}`);
    assert.ok(preset.font_display in FONTS && preset.font_body in FONTS, name);
    assert.deepEqual(readabilityWarnings(preset), [], `${name} has hard-to-read colors`);
  }
});

test('the stylesheet defaults match the default theme', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(cssVars({}))) {
    if (name.startsWith('--font')) continue;
    assert.ok(css.includes(`${name}: ${value};`), `${name} should default to ${value}`);
  }
});

test('every wording key used in the pages exists, and every default is used', () => {
  const files = ['src/pages', 'src/components'].flatMap((dir) =>
    readdirSync(new URL(`../${dir}`, import.meta.url)).map((f) => readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8')));
  const used = new Set(files.flatMap((src) => [...src.matchAll(/\bt\('([a-z][a-z0-9_.]+)'/g)].map((m) => m[1])));
  for (const key of used) assert.ok(key in COPY, `page uses unknown wording ${key}`);
  for (const key of Object.keys(COPY)) assert.ok(used.has(key), `wording ${key} is never shown`);
});

test('the legal notice is fixed, not editable wording', () => {
  for (const item of Object.values(COPY)) assert.doesNotMatch(item.text, /Play money only/);
  const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<p className="notice">Play money only\. No real-money wagering\.<\/p>/);
});

test('cleaning keeps only valid settings and real changes', () => {
  assert.deepEqual(cleanTheme({ bg: '#ABCDEF', ink: 'red', font_body: 'Comic Sans', font_display: 'Georgia', junk: '#ffffff' }),
    { bg: '#abcdef', font_display: 'Georgia' });
  assert.deepEqual(themeChanges({ ...DEFAULT_THEME, bg: '#ffffff' }), { bg: '#ffffff' });
  assert.deepEqual(cleanCopy({ 'brand.name': 'The Line', 'brand.motto': COPY['brand.motto'].text, 'nav.feed': '   ', bogus: 'x' }),
    { 'brand.name': 'The Line' });
});

test('wording fill-ins and readability checks', () => {
  assert.equal(fill('Week {week} lines', { week: 9 }), 'Week 9 lines');
  assert.equal(fill('Hi {nobody}', {}), 'Hi {nobody}');
  assert.deepEqual(placeholders('board.intro'), ['{open}', '{total}']);
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(readabilityWarnings({ ink: '#eee9dd' }).length > 0, true);
  assert.match(fontsHref({}), /family=Newsreader.*family=Inter/);
  assert.equal(fontsHref({ font_display: 'Georgia', font_body: 'Georgia' }), null);
  assert.equal(cssVars({ font_display: 'Georgia' })['--font-display'], FONTS.Georgia.stack);
});
