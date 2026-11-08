'use client'

// What the AI learned: style rules by group, each switchable, plus "Add a rule yourself".
// Every AI request includes the rules that are on (blocks/CVs or interview answers).
import { useState, useTransition } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { addRule, deleteRule, setRuleOn } from '../actions'
import { filterRules, GROUPS, groupRules, isLearnedFromUse, RULE_FILTERS, type GroupId, type RuleFilter, type RuleItem } from '../types'

export function PreferencesScreen({ initialRules }: { initialRules: RuleItem[] }) {
  const [rules, setRules] = useState(initialRules)
  const [newRule, setNewRule] = useState('')
  const [newGroup, setNewGroup] = useState<GroupId>('cv')
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<RuleItem | null>(null)
  const [show, setShow] = useState<RuleFilter>('all')
  const [adding, startAdding] = useTransition()

  const toggle = async (rule: RuleItem) => {
    setError(null)
    setRules((all) => all.map((r) => (r.id === rule.id ? { ...r, on: !rule.on } : r)))
    const res = await setRuleOn({ id: rule.id, on: !rule.on })
    if (!res.ok) {
      setRules((all) => all.map((r) => (r.id === rule.id ? { ...r, on: rule.on } : r)))
      setError(res.error)
    }
  }

  const remove = async (rule: RuleItem) => {
    setError(null)
    setRules((all) => all.filter((r) => r.id !== rule.id))
    const res = await deleteRule({ id: rule.id })
    if (!res.ok) {
      setRules((all) => [...all, rule].sort((a, b) => a.position - b.position))
      setError(res.error)
      return
    }
    setDeleted(rule)
  }

  const undoDelete = () => {
    const rule = deleted
    if (!rule) return
    setDeleted(null)
    startAdding(async () => {
      const res = await addRule({ group: rule.group, text: rule.text, source: rule.source, on: rule.on, position: rule.position })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRules((all) => [...all, res.data].sort((a, b) => a.position - b.position))
    })
  }

  const add = () => {
    const text = newRule.trim()
    if (!text) return
    setError(null)
    startAdding(async () => {
      const res = await addRule({ group: newGroup, text })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRules((all) => [...all, res.data])
      setNewRule('')
    })
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-3.5 pb-14 pt-[18px]">
      <header className="flex flex-col gap-1.5">
        <p className="eyebrow text-[12px]">WHAT THE AI LEARNED</p>
        <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">Your style rules</h1>
        <p className="m-0 max-w-[680px] text-[14px] leading-[1.5] text-[var(--muted)]">
          The rules the AI follows when it writes for you. Every AI request includes the ones that are on; switch one off to stop using it without
          losing it.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          {(error || deleted) && (
            <div role={error ? 'alert' : 'status'} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-[13px]">
              {error ? (
                <span className="text-[var(--amber)]">{error}</span>
              ) : (
                <>
                  <span className="text-[var(--text-2)]">Rule deleted.</span>
                  <button type="button" className="btn-s h-7 px-2.5 text-[12px]" onClick={undoDelete}>
                    Undo
                  </button>
                </>
              )}
            </div>
          )}
          <div role="group" aria-label="Show rules" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--muted)]">
            <span>Show:</span>
            {RULE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="btn-s"
                aria-pressed={show === f.id}
                onClick={() => setShow(f.id)}
                style={{ height: 30, borderRadius: 999, ...(show === f.id ? { borderColor: 'var(--indigo)', color: 'var(--indigo-hover)', background: 'var(--indigo-soft)' } : {}) }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {groupRules(filterRules(rules, show)).map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`} className="flex flex-col rounded-xl border border-[var(--border)] bg-white px-[18px] pb-3 pt-2">
              <h2 id={`g-${g.id}`} className="m-0 pb-1.5 pt-3 text-[15px] font-semibold">
                {g.name}
              </h2>
              {g.rules.length === 0 && (
                <p className="m-0 border-t border-[#eef0f3] py-3 text-[13px] text-[var(--muted)]">{show === 'all' ? 'No rules yet.' : 'None with this filter.'}</p>
              )}
              <ul className="m-0 flex list-none flex-col p-0">
                {g.rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-[#eef0f3] py-3">
                    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
                      <span className={`text-[14px] leading-[1.5] ${r.on ? 'text-[var(--text)]' : 'text-[var(--muted)] line-through'}`}>{r.text}</span>
                      {r.source && (
                        <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--muted)]">
                          {isLearnedFromUse(r.source) && (
                            <span className="rounded border border-[var(--amber-line)] bg-[var(--amber-soft)] px-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--amber)]">Learned from use</span>
                          )}
                          {r.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 px-1.5 text-[13px] text-[var(--text-2)]">
                        <input type="checkbox" role="switch" checked={r.on} onChange={() => void toggle(r)} className="h-[18px] w-[18px] accent-[var(--indigo)]" />
                        {r.on ? 'On' : 'Off'}
                      </label>
                      <button
                        type="button"
                        aria-label={`Delete rule: ${r.text}`}
                        onClick={() => void remove(r)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--text)]"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <form
            className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-white px-[18px] py-4"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <label htmlFor="new-rule" className="text-[14px] font-semibold">
              Add a rule yourself
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="new-rule"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="e.g. Never use the word “passionate”"
                className="min-h-11 min-w-0 flex-[1_1_320px] rounded-lg border border-[var(--border-strong)] px-3 text-[14px] placeholder:text-[#6b7180]"
              />
              <label htmlFor="new-rule-group" className="sr-only">
                Applies to
              </label>
              <select
                id="new-rule-group"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as GroupId)}
                className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 text-[13px]"
              >
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    For {g.name.toLowerCase()}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-p min-h-11 rounded-lg px-[18px] text-[14px]" disabled={!newRule.trim() || adding}>
                {adding ? 'Adding…' : 'Add rule'}
              </button>
            </div>
          </form>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-white p-4">
            <h2 className="m-0 text-[15px] font-semibold">How the rules are used</h2>
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-[18px] text-[13px] leading-[1.5] text-[var(--text-2)]">
              <li>Rules for blocks and CVs go into Compose CV, Job analysis and “Draft a block from this”.</li>
              <li>Rules for interview answers go into Behavioral.</li>
              <li>Nothing is fine-tuned, so you can see and undo everything. The ground rules always win: the AI never invents a fact.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}
