import styles from '../analysis.module.css'

type Name = string | false | null | undefined

/**
 * The prototype's class names → this screen's CSS-module classes: c('a-pop ans-pop', open && 'on').
 * A name the module doesn't define passes through unchanged (global classes such as "sr-only").
 */
export function c(...names: Name[]): string {
  return names
    .filter((n): n is string => Boolean(n))
    .flatMap((n) => n.split(/\s+/))
    .filter(Boolean)
    .map((n) => styles[n] ?? n)
    .join(' ')
}
