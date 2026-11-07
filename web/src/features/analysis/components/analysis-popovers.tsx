'use client'

// The one popover open at a time on Job analysis, with its data taken from the session (one modal that
// swaps its content and remembers "← Back", like the prototype).
import { blockRequirements, cvRequirements } from '../coverage'
import { setAnswer, setDont } from '../session-state'
import { AnswerPopover } from './answer-popover'
import { BlockPopover } from './block-popover'
import { MetPopover } from './met-popover'
import { NotMetPopover } from './not-met-popover'
import { PlacementPopover } from './placement-popover'
import { PostingPopover } from './posting-popover'
import { RequirementPopover } from './requirement-popover'
import type { BlockTagKind } from './ui/hit-card'
import type { Analysis } from './use-analysis'
import { askNumber, findView, hitsFor, requirementOf, type BlockView, type BlockViews, type EditTarget } from './view-model'

type Props = { a: Analysis; views: BlockViews; lines: string[]; listItems: boolean[]; onEdit: (target: EditTarget) => void }

const hostOf = (url: string | null | undefined): string => {
  try {
    return url ? new URL(url).host.replace(/^www\./, '') : 'the posting you pasted'
  } catch {
    return 'the posting'
  }
}

const cardTag = (v: BlockView): BlockTagKind => (v.tag === 'left-out' ? 'not-in-cv' : v.tag)

export function AnalysisPopovers({ a, views, lines, listItems, onEdit }: Props) {
  const s = a.session
  const m = a.modal
  if (!s || !m) return null
  const close = () => a.setModal(null)
  const busy = a.phase !== 'idle'
  const before = s.step === 'input'
  const kept = [...views.drafts.filter((v) => v.keep), ...views.asIs]
  const editOf = (v: BlockView): (() => void) | undefined => {
    if (v.kind === 'draft' && v.key) return () => onEdit({ type: 'draft', key: v.key as string })
    if (v.kind === 'asis' && v.versionId) return () => onEdit({ type: 'asis', versionId: v.versionId as string })
    return undefined
  }
  const posting = (reqId: string, backLabel: string) => a.setModal({ kind: 'posting', reqId, backLabel, back: m })
  const reqOfAsk = (askId: string) => requirementOf(s, s.analysis.asks.find((x) => x.id === askId)?.requirementId)
  const host = hostOf(a.job?.links[0]?.url)

  switch (m.kind) {
    case 'answer':
      return (
        <AnswerPopover
          asks={s.analysis.asks}
          askId={m.askId}
          mode={m.mode}
          answers={s.answers}
          dont={s.dont}
          sent={s.sent}
          quoteFor={(id) => {
            const r = reqOfAsk(id)
            return r && r.quotes.length ? { quotes: r.quotes, keys: r.keys } : null
          }}
          postingLines={lines}
          busy={busy}
          onAnswer={(id, text) => a.change((x) => setAnswer(x, id, text))}
          onDont={(id, dont) => a.change((x) => setDont(x, id, dont))}
          onGo={(id) => a.setModal({ ...m, askId: id })}
          onDone={close}
          onOpenPosting={(id) => {
            const r = reqOfAsk(id)
            if (r) posting(r.id, `Q${askNumber(s, id)}`)
          }}
          onSend={(id) => void a.send(id)}
        />
      )
    case 'placement':
      return (
        <PlacementPopover
          items={m.items}
          skipped={m.skipped}
          experiences={a.experiences}
          busy={busy}
          onConfirm={(dest) => a.confirmPlacement(dest)}
          onNotNow={() => a.confirmPlacement({})}
          onClose={close}
        />
      )
    case 'jobReq': {
      const r = requirementOf(s, m.reqId)
      if (!r) return null
      const pool = before ? [...views.drafts, ...views.asIs, ...views.leftOut] : [...views.drafts, ...views.asIs]
      const askIndex = s.analysis.asks.findIndex((x) => x.requirementId === r.id)
      return (
        <RequirementPopover
          requirement={r}
          postingLines={lines}
          hits={hitsFor(r.id, pool).map((h) => ({ tag: cardTag(h.view), blockName: h.view.blockName, title: h.view.title, dates: h.view.section === 'EXPERIENCE' ? h.view.dates : undefined, bullets: h.view.bullets, phrases: h.phrases, onEdit: editOf(h.view) }))}
          ask={before && askIndex >= 0 ? { n: askIndex + 1, text: s.analysis.asks[askIndex].text } : null}
          showAddExperience={!before && r.status === 'missing'}
          onOpenPosting={() => posting(r.id, `“${r.text}”`)}
          onAnswer={() => {
            if (askIndex >= 0) a.setModal({ kind: 'answer', askId: s.analysis.asks[askIndex].id, mode: 'live' })
          }}
          onAddExperience={() => a.openNotMet(r.id)}
          onClose={close}
        />
      )
    }
    case 'posting': {
      const r = requirementOf(s, m.reqId)
      if (!r) return null
      return <PostingPopover lines={lines} listItems={listItems} host={host} requirementName={r.text} quotes={r.quotes} keys={r.keys} backLabel={m.backLabel} onBack={() => a.setModal(m.back)} onClose={close} />
    }
    case 'met': {
      const r = requirementOf(s, m.reqId)
      if (!r) return null
      const back = m.backBlock ? findView(views, m.backBlock) : null
      return (
        <MetPopover
          requirement={r}
          postingLines={lines}
          hits={hitsFor(r.id, kept).map((h) => ({ id: h.view.ref, tag: cardTag(h.view), blockName: h.view.blockName, title: h.view.title, dates: h.view.section === 'EXPERIENCE' ? h.view.dates : undefined, bullets: h.view.bullets, phrases: h.phrases, editable: Boolean(editOf(h.view)) }))}
          backTo={back?.blockName ?? null}
          onBack={() => {
            if (back) a.setModal({ kind: 'block', ref: back.ref })
          }}
          onOpenPosting={() => posting(r.id, `“${r.text}”`)}
          onEditBlock={(ref) => {
            const v = findView(views, ref)
            const edit = v ? editOf(v) : undefined
            if (edit) edit()
          }}
          onClose={close}
        />
      )
    }
    case 'notMet': {
      const r = requirementOf(s, m.reqId)
      if (!r) return null
      const askIndex = s.analysis.asks.findIndex((x) => x.requirementId === r.id)
      const said = askIndex >= 0 && s.dont[s.analysis.asks[askIndex].id]
      return (
        <NotMetPopover
          requirement={r}
          postingLines={lines}
          why={said ? `You answered “Don’t have it” to Q${askIndex + 1}, so the CV doesn’t claim it.` : r.evidence}
          experiences={a.experiences}
          busy={a.notMet.busy}
          done={a.notMet.done}
          error={a.notMet.error}
          onOpenPosting={() => posting(r.id, `“${r.text}”`)}
          onSubmit={(v) => void a.addExperience(r.id, v)}
          onClose={close}
        />
      )
    }
    case 'block': {
      const v = findView(views, m.ref)
      if (!v) return null
      const met = new Set(cvRequirements(s.analysis, kept.map((x) => ({ id: x.ref, blockName: x.blockName, matches: x.matches }))).met.map((x) => x.requirement.id))
      return (
        <BlockPopover
          tag={v.tag}
          blockName={v.blockName}
          versionName={v.versionName}
          title={v.title}
          dates={v.section === 'EXPERIENCE' ? v.dates : undefined}
          stack={v.section === 'PROJECT' ? v.stack : undefined}
          bullets={v.bullets}
          requirements={blockRequirements(v.matches, s.analysis.requirements).map((x) => ({ id: x.requirement.id, name: x.requirement.text, jobSays: x.requirement.quotes[0] ?? null, jobKeys: x.requirement.keys, phrases: x.phrases, partly: x.partly }))}
          leftOutWhy={v.kind === 'left-out' || v.kind === 'asis-out' ? v.why : null}
          onOpenRequirement={(id) => (met.has(id) ? a.setModal({ kind: 'met', reqId: id, backBlock: v.ref }) : a.openNotMet(id))}
          onEdit={editOf(v)}
          onClose={close}
        />
      )
    }
  }
}
