'use client'

// "Swap" on a row of the review order (prototype next-ideas.html #order): a menu of the blocks that are Left out.
// The chosen one takes this block's place. Keyboard: the first item takes the focus, ↑/↓ move, Esc closes and the
// focus goes back to Swap; a click outside closes it too.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { c } from './ui/cx'

export type SwapItem = { key: string; name: string; sub: string }

type Props = {
  /** The block on this row ("Use instead of Termo"). */
  name: string
  items: SwapItem[]
  disabled: boolean
  onPick: (key: string) => void
}

export function SwapMenu({ name, items, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The row moves with ↑/↓ too: keys pressed in the menu stay in the menu.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Tab') return setOpen(false)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  const none = items.length === 0
  return (
    <>
      <button
        ref={button}
        type="button"
        className={c('a-btn sm')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || none}
        title={none ? 'Nothing is left out to swap in.' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Swap
      </button>
      {open && (
        <div ref={menu} className={c('ord-menu')} role="menu" aria-label={`Use instead of ${name}`} onKeyDown={onKeyDown}>
          <p aria-hidden="true">Use instead of {name}</p>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                onPick(item.key)
              }}
            >
              <span>{item.name}</span>
              <small>{item.sub}</small>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
