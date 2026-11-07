import type { CSSProperties } from 'react'
import ui from './ui.module.css'

// The canvas look as inline styles (globals.css has unlayered element rules that would beat utility
// classes on buttons and inputs). Colors are the tokens of globals.css.
export const C = {
  text: '#14161B',
  text2: '#353B47',
  ink: '#22252C',
  muted: '#535A68',
  faint: '#8A90A0',
  border: '#E2E4E9',
  borderStrong: '#D5D8DE',
  hairline: '#EEF0F3',
  indigo: '#4338CA',
  indigoInk: '#3730A3',
  indigoSoft: '#EEF0FE',
  indigoLine: '#C7CBFA',
  amber: '#8A4300',
  amberInk: '#5C2E00',
  amberSoft: '#FFF5E6',
  amberLine: '#F2CF94',
  amberButton: '#E0B670',
  ok: '#15803D',
  okInk: '#14632F',
  warn: '#B45309',
  danger: '#B42318',
  page: '#F3F4F6',
  well: '#F6F7F9',
  previewBg: '#E4E5E8',
  paperInk: '#111111',
} as const

export const SERIF = "var(--font-source-serif), 'Source Serif 4', Georgia, serif"
export const SANS = "var(--font-geist-sans), 'Geist', ui-sans-serif, system-ui, sans-serif"
export const MONO = "var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace"

export const cls = ui

export function btnS(height = 30, extra: CSSProperties = {}): CSSProperties {
  return {
    height,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxSizing: 'border-box',
    padding: '0 10px',
    borderRadius: 6,
    border: `1px solid ${C.borderStrong}`,
    background: '#FFFFFF',
    color: C.ink,
    fontSize: 12.5,
    fontWeight: 500,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ...extra,
  }
}

export function btnP(height = 30, extra: CSSProperties = {}): CSSProperties {
  return {
    height,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxSizing: 'border-box',
    padding: '0 12px',
    borderRadius: 6,
    border: `1px solid ${C.indigo}`,
    background: C.indigo,
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    ...extra,
  }
}

export function iconB(size = 26, extra: CSSProperties = {}): CSSProperties {
  return {
    flex: '0 0 auto',
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 0,
    borderRadius: 6,
    background: 'transparent',
    color: C.muted,
    ...extra,
  }
}

export const linkButton: CSSProperties = {
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 6px',
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  fontSize: 12,
  fontWeight: 500,
  color: C.indigo,
}

export const searchInput: CSSProperties = {
  width: '100%',
  height: 32,
  boxSizing: 'border-box',
  padding: '0 10px 0 30px',
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 6,
  background: '#FFFFFF',
  fontSize: 12.5,
}

export const popover: CSSProperties = {
  boxSizing: 'border-box',
  background: '#FFFFFF',
  border: `1px solid ${C.borderStrong}`,
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(20, 22, 27, 0.14)',
}

export const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  boxSizing: 'border-box',
  display: 'flex',
  justifyContent: 'center',
  overflowY: 'auto',
}

/** Segmented control (1 page / 2 pages, Any / All). */
export function segment(on: boolean, extra: CSSProperties = {}): CSSProperties {
  return on
    ? { height: 26, padding: '0 10px', borderRadius: 6, border: 0, background: '#FFFFFF', color: C.text, fontSize: 12, fontWeight: 600, boxShadow: '0 1px 2px rgba(20, 22, 27, 0.1)', ...extra }
    : { height: 26, padding: '0 10px', borderRadius: 6, border: 0, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 500, ...extra }
}

/** "Like the CV" input: serif, no box (highlight on hover and focus comes from cls.cvIn). */
export function cvField(extra: CSSProperties = {}): CSSProperties {
  return {
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '0 6px',
    border: 0,
    borderRadius: 4,
    fontFamily: SERIF,
    color: C.paperInk,
    ...extra,
  }
}
