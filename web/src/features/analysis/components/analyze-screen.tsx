'use client'

// Job analysis v2: from a job posting link to the CV for it (Read → Compare → Your input → Drafts → Review & save).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DraftBullet } from '../../ai/types'
import { fromEditorBullets, toEditorBullets } from '../../blocks/bullets'
import type { BulletData, LibBlock, LibVersion } from '../../blocks/types'
import { ComposeEditor, type ComposeEditing, type EditorCopy } from '../../cv/components/compose-editor'
import { toSavedItems } from '../../cv/composition'
import { printCv } from '../../cv/print'
import type { JobData } from '../../jobs/types'
import type { ProfileData } from '../../profile/types'
import { blockRequirements, cvRequirements } from '../coverage'
import { arrangementChanged, swapChoices } from '../arrangement'
import { compositionOfRows, draftVersionId, libraryWithDrafts, reviewInput, reviewRows } from '../cv-draft'
import { postingLines, postingListItems } from '../highlight'
import type { LoadedAnalysisJob } from '../queries'
import { blocksSummary, discardedLabel, improvesLabel, metBlocksLine, reviewBlockSub, reviewBlockTag, saveLabel } from '../review-labels'
import { discardDraft, editAsIs, pipelineStep, restoreDraft, setKeep, setPages, setStep, toggleAsIsOut, updateDraft } from '../session-state'
import { libraryWithTitles, roleTitleRows, setTitleChoice, titlesForSave } from '../role-titles'
import type { ExperienceOption } from '../types'
import { AnalysisPopovers } from './analysis-popovers'
import { AnswersDone } from './answers-done'
import { BlocksPanel } from './blocks-panel'
import { JobHeader } from './job-header'
import { JobSplit } from './job-split'
import { LinksOverlap } from './links-overlap'
import { QuestionsPanel } from './questions-panel'
import { RequirementsPanel } from './requirements-panel'
import { reviewOrderActions } from './review-order-actions'
import { ReviewOrderCard } from './review-order-card'
import { orderGroups, orderStatus, swapItems } from './review-order-view'
import { ReviewView } from './review-view'
import { RoleTitlesCard } from './role-titles-card'
import { SavedBanner } from './saved-banner'
import { StartCard } from './start-card'
import { StatusLine } from './status-line'
import { Steps } from './steps'
import { c } from './ui/cx'
import { useAnalysis, type Phase } from './use-analysis'
import { askNumber, blockViews, chipItems, cvViews, editTargetForCvBlock, nameLookup, topicFor, type EditTarget } from './view-model'

type Props = {
  loaded: LoadedAnalysisJob | null
  experiences: ExperienceOption[]
  library: LibBlock[]
  profile: ProfileData
  aiReady: boolean
  notReadyText: string
}

const WORKING: Record<Exclude<Phase, 'idle'>, string> = {
  reading: 'Reading the posting (up to 20 seconds per link)…',
  comparing: 'The AI is comparing the posting with your blocks. This takes a minute or two.',
  placing: 'The AI is reading your answers to add each one to the experience it is about…',
  redrafting: 'The AI is updating the drafts with your answers…',
  saving: 'Saving the versions and the CV…',
}

/** The edit popover in the prototype's words: Done keeps the edit with this job's CV, saved at the end. */
const EDIT_COPY: EditorCopy = { saveLabel: 'Done', savedNote: 'saved with the CV at the end' }

const jobAsData = (j: { id: string; company: string; role: string; label: string }): JobData => ({ ...j, links: [], cv: null, analyzedAt: null })
const asBullets = (b: readonly DraftBullet[]): BulletData[] => b.map((x) => ({ kind: x.kind, text: x.text, want: x.want ?? null }))

export function AnalyzeScreen({ loaded, experiences, library, profile, aiReady, notReadyText }: Props) {
  const a = useAnalysis({ loaded, experiences })
  const router = useRouter()
  /** The open editor: what it edits, the edit so far, and how it started ("No changes yet." until they differ). */
  const [editing, setEditing] = useState<{ target: EditTarget; editing: ComposeEditing; start: ComposeEditing } | null>(null)
  const lines = useMemo(() => postingLines(a.postingText), [a.postingText])
  const listItems = useMemo(() => postingListItems(a.postingText), [a.postingText])
  const s = a.session
  const views = useMemo(() => (s ? blockViews(s, library) : null), [s, library])
  // The review CV is only laid out on the review steps (layout is the costly part).
  const printed = useMemo(() => {
    if (!s || (s.step !== 'review' && s.step !== 'saved')) return null
    const { rows, out } = reviewRows(reviewInput(library, s))
    const comp = compositionOfRows(rows, s.pages, s.arrangement?.oneSection)
    const withDrafts = libraryWithDrafts(library, s.drafts)
    const titles = roleTitleRows({ comp, library: withDrafts, drafts: s.drafts, roleTitles: s.analysis.roleTitles, titles: s.titles, jobRole: a.job?.role ?? '' })
    return { rows, out, comp, titles, print: printCv(comp, libraryWithTitles(withDrafts, titles), profile) }
  }, [s, library, profile, a.job?.role])
  // Drag, ↑/↓, Swap, Move to and One section on review: each reads the latest session (a.change).
  const arrange = useMemo(() => reviewOrderActions(a.change, (x) => reviewInput(library, x)), [a.change, library])
  const busy = a.phase !== 'idle'
  const reqs = s?.analysis.requirements ?? []

  // Choosing a job: "Read posting" is done and the dashed "Which job?" pill is the current one (see Steps).
  const step = a.split ? 1 : a.phase === 'reading' ? 0 : a.phase === 'comparing' && !s ? 1 : a.phase === 'placing' || a.phase === 'redrafting' ? 3 : s ? pipelineStep(s) : 0
  const headMode = a.split ? 'none' : !a.job ? (a.phase === 'reading' ? 'creating' : 'none') : a.resumed ? 'resumed' : 'job'

  // ── Edit popover: the same one as Compose CV (decision log); Done keeps the edit with this job's CV ──
  function openEdit(target: EditTarget) {
    if (!s) return
    a.setModal(null) // the editor is its own dialog; a popover left open would cover it
    if (target.type === 'draft') {
      const d = s.drafts.find((x) => x.key === target.key)
      if (!d) return
      const draft = { title: d.title, bullets: toEditorBullets(asBullets(d.bullets), (i) => `${d.key}-${i}`) }
      const e: ComposeEditing = d.newBlock ? { kind: 'new', meta: { ...d.newBlock }, draft, focusTitle: true } : { kind: 'edit', blockId: d.blockId ?? '', versionId: draftVersionId(d.key), draft, saveAs: d.saveAs }
      setEditing({ target, editing: e, start: e })
      return
    }
    const r = s.analysis.reused.find((x) => x.versionId === target.versionId)
    if (!r) return
    const e: ComposeEditing = { kind: 'edit', blockId: r.blockId, versionId: r.versionId, draft: { title: r.title, bullets: toEditorBullets(asBullets(r.bullets), (i) => `${r.versionId}-${i}`) }, saveAs: 'new' }
    setEditing({ target, editing: e, start: e })
  }

  function saveEdit() {
    if (!editing || !s || !a.job) return
    const e = editing.editing
    const bullets = fromEditorBullets(e.draft.bullets) as DraftBullet[]
    const title = e.draft.title.trim()
    const t = editing.target
    if (t.type === 'draft' && e.kind === 'new') {
      a.change((x) => ({ ...x, drafts: x.drafts.map((d) => (d.key === t.key ? { ...d, title: title || d.title, bullets, newBlock: { ...e.meta }, blockName: e.meta.name.trim() || d.blockName, editedByHand: true } : d)) }))
    } else if (t.type === 'draft' && e.kind === 'edit') {
      a.change((x) => updateDraft(x, t.key, { title: title || undefined, bullets, saveAs: e.saveAs }))
    } else if (t.type === 'asis' && e.kind === 'edit') {
      const r = s.analysis.reused.find((x) => x.versionId === t.versionId)
      const label = a.job.label
      if (r) a.change((x) => editAsIs(x, r, { name: label, title: title || r.title, bullets, saveAs: e.saveAs }))
    }
    setEditing(null)
  }

  const ed = editing?.editing
  const editBlock = ed && ed.kind === 'edit' ? (library.find((b) => b.id === ed.blockId) ?? null) : null
  const editVersion: LibVersion | null = (() => {
    if (!editing || editing.editing.kind !== 'edit' || !s) return null
    const t = editing.target
    if (t.type === 'asis') return editBlock?.versions.find((v) => v.id === t.versionId) ?? null
    const d = s.drafts.find((x) => x.key === t.key)
    if (!d || !editBlock) return null
    return { id: draftVersionId(d.key), blockId: editBlock.id, name: d.fromVersionName ?? 'Base', title: d.title, isBase: false, themes: [], position: 0, bullets: asBullets(d.bullets), jobIds: [] }
  })()

  // ── The three panels (steps Your input and Drafts) ──
  const panels = () => {
    if (!s || !views) {
      return (
        <div className={c('a-cols')}>
          <RequirementsPanel analysis={null} phase="before" blockNameOf={(id) => id} onOpen={() => undefined} />
          <QuestionsPanel mode="empty" asks={[]} answers={{}} dont={{}} hintFor={() => null} busy onOpen={() => undefined} onUpdateDrafts={() => undefined} />
          <BlocksPanel cards={[]} summary="Nothing yet" undoLabel={null} busy onUndo={() => undefined} onAskChanges={() => undefined} onReview={() => undefined} />
        </div>
      )
    }
    const nameOf = nameLookup(s)
    const cards = [
      ...views.drafts.map((v) => ({
        key: v.ref,
        kind: v.isNewBlock ? ('new-block' as const) : ('new-version' as const),
        blockName: v.blockName,
        versionName: v.versionName,
        title: v.title,
        bullets: v.bullets,
        improves: v.improvedBy && !s.sent[v.improvedBy] ? improvesLabel(askNumber(s, v.improvedBy)) : null,
        why: v.why,
        chipItems: chipItems(v, reqs),
        chipEmptyText: 'No requirement of this job.',
        keep: v.keep,
        onKeep: (keep: boolean) => a.change((x) => setKeep(x, v.key as string, keep)),
        onEdit: () => openEdit({ type: 'draft', key: v.key as string }),
        onRemove: () =>
          a.change((x) => {
            const r = discardDraft(x, v.key as string)
            a.setUndo({ undo: r.undo, asIsVersion: null, label: discardedLabel(v.blockName, 'discard') })
            return r.session
          }),
      })),
      ...views.asIs.map((v) => ({
        key: v.ref,
        kind: 'as-is' as const,
        blockName: v.blockName,
        versionName: v.versionName,
        title: v.title,
        bullets: v.bullets,
        chipItems: chipItems(v, reqs),
        chipEmptyText: v.why ?? 'No requirement of this job.',
        onEdit: () => openEdit({ type: 'asis', versionId: v.versionId as string }),
        onRemove: () => {
          a.change((x) => toggleAsIsOut(x, v.versionId as string))
          a.setUndo({ undo: null, asIsVersion: v.versionId, label: discardedLabel(v.blockName, 'leave-out') })
        },
      })),
    ]
    const hintFor = (askId: string) => {
      const d = s.drafts.find((x) => x.improvedBy === askId)
      return d ? `Can fill the gap in the ${d.blockName} draft.` : null
    }
    return (
      <div className={c('a-cols')}>
        <RequirementsPanel analysis={s.analysis} phase={s.step === 'input' ? 'before' : 'after'} blockNameOf={nameOf} onOpen={(id) => a.setModal({ kind: 'jobReq', reqId: id })} />
        {s.step === 'input' ? (
          <QuestionsPanel mode="cards" asks={s.analysis.asks} answers={s.answers} dont={s.dont} hintFor={hintFor} busy={busy} onOpen={(id) => a.setModal({ kind: 'answer', askId: id, mode: 'live' })} onUpdateDrafts={() => void a.updateDrafts()} />
        ) : (
          <AnswersDone asks={s.analysis.asks} sent={s.sent} topicFor={(id) => topicFor(s, id)} onOpen={(id) => a.setModal({ kind: 'answer', askId: id, mode: 'sent' })} onAddExperience={(id) => {
            const reqId = s.analysis.asks.find((x) => x.id === id)?.requirementId
            if (reqId) a.openNotMet(reqId)
          }} />
        )}
        <BlocksPanel
          cards={cards}
          summary={blocksSummary(cards.map((x) => x.kind))}
          undoLabel={a.undo?.label ?? null}
          busy={busy}
          onUndo={() => {
            const u = a.undo
            if (!u) return
            a.change((x) => (u.asIsVersion ? toggleAsIsOut(x, u.asIsVersion) : restoreDraft(x, u.undo)))
            a.setUndo(null)
          }}
          onAskChanges={(text) => void a.redraft(text)}
          onReview={() => a.change((x) => setStep(x, 'review'))}
        />
      </div>
    )
  }

  // ── Review & save: the whole CV for this job ──
  const review = () => {
    if (!s || !views || !a.job || !printed) return null
    const job = a.job
    // What is on the CV after drags and swaps (a swapped-in block brings its matches; one swapped out goes to Left out).
    const placed = cvViews(views, printed.rows, printed.out)
    const kept = placed.onCv
    const keptDrafts = kept.filter((v) => v.kind === 'draft')
    const onCv = new Set(keptDrafts.map((v) => v.key))
    const comp = printed.comp
    const forSave = titlesForSave(s.drafts.filter((d) => d.keep && onCv.has(d.key)), printed.titles)
    const { met, notMet } = cvRequirements(s.analysis, kept.map((v) => ({ id: v.ref, blockName: v.blockName, matches: v.matches })))
    const group = (g: 'new' | 'asis' | 'out', list: typeof kept) =>
      list.map((v) => ({
        group: g,
        id: v.ref,
        name: v.blockName,
        tag: g === 'asis' && (v.kind === 'left-out' || v.kind === 'asis-out') ? 'Swapped in' : reviewBlockTag(g, v.isNewBlock),
        sub: reviewBlockSub({ group: g, matches: blockRequirements(v.matches, reqs), versionName: v.versionName }),
        matched: v.matches.length > 0,
      }))
    const saved = s.step === 'saved'
    const oneSection = s.arrangement?.oneSection ?? false
    const pool = { rows: printed.rows, out: printed.out, leftOut: s.analysis.leftOut, reused: s.analysis.reused, asIsOut: s.asIsOut, arrangement: s.arrangement }
    const swapsFor = (key: string) => {
      const row = printed.rows.find((r) => r.key === key)
      return row ? swapItems(swapChoices(pool, row), printed.out, views, reqs) : []
    }
    return (
      <>
        {saved && <SavedBanner savedCount={keptDrafts.length + forSave.retitled.length} jobLabel={job.label} onAnalyzeAnother={a.reset} />}
        <ReviewView
          met={met.map((x) => ({ id: x.requirement.id, name: x.requirement.text, blocks: metBlocksLine(x.hits), partly: x.partly }))}
          notMet={notMet.map((r) => ({ id: r.id, name: r.text }))}
          total={reqs.length}
          blocks={[...group('new', keptDrafts), ...group('asis', kept.filter((v) => v.kind !== 'draft')), ...group('out', placed.out)]}
          layout={printed.print.layout}
          profile={profile}
          labels={printed.print.labels}
          newBlockIds={keptDrafts.map((v) => v.blockId)}
          retitledBlockIds={printed.titles.filter((r) => r.changed).map((r) => r.blockId)}
          titles={<RoleTitlesCard jobRole={job.role} rows={printed.titles} disabled={saved || busy} onPick={(key, choice) => a.change((x) => setTitleChoice(x, key, choice))} />}
          order={
            <ReviewOrderCard
              groups={orderGroups({ rows: printed.rows, views, requirements: reqs, oneSection })}
              status={orderStatus(s)}
              canReset={arrangementChanged(s.arrangement)}
              disabled={saved || busy}
              choicesFor={swapsFor}
              onMoveBy={arrange.moveBy}
              onMoveTo={arrange.moveTo}
              onSwap={arrange.swap}
              onSection={arrange.toSection}
              onReset={arrange.reset}
            />
          }
          oneSection={oneSection}
          onOneSection={arrange.setOneSection}
          pages={s.pages}
          saved={saved}
          busy={busy}
          saveLabel={saveLabel(keptDrafts.length + forSave.retitled.length)}
          onPages={(p) => a.change((x) => setPages(x, p))}
          onBack={() => a.change((x) => setStep(x, 'drafts'))}
          onSave={() =>
            void a.save({ ...forSave, cv: { pages: comp.pages, sectionOrder: comp.order, oneSection, showEducation: comp.edu, showSkills: comp.skills, showAchievements: comp.ach, items: toSavedItems(comp) } })
          }
          onOpenCompose={() => router.push(`/compose?job=${encodeURIComponent(job.id)}`)}
          onOpenRequirement={(id) => (met.some((x) => x.requirement.id === id) ? a.setModal({ kind: 'met', reqId: id, backBlock: null }) : a.openNotMet(id))}
          onOpenBlock={(ref) => a.setModal({ kind: 'block', ref })}
          onEditBlock={(blockId) => {
            const t = editTargetForCvBlock(s, blockId)
            if (t) openEdit(t)
          }}
        />
      </>
    )
  }

  const reviewing = s && (s.step === 'review' || s.step === 'saved')
  return (
    <div className={c('screen')}>
      <JobHeader mode={headMode} job={a.job ? { label: a.job.label, url: a.job.links[0]?.url ?? null } : null} analyzedAt={s?.analyzedAt ?? null} busy={busy} onAnalyzeAgain={() => void a.analyzeAgain()} />
      <Steps current={step} extra={a.whichJob} />
      {busy && <StatusLine text={WORKING[a.phase as Exclude<Phase, 'idle'>]} />}
      {a.problem && <StatusLine tone="error" text={a.problem.message} onRetry={a.problem.retry ?? undefined} />}
      {a.notice && !busy && <StatusLine text={a.notice} />}
      {a.saveState.status === 'error' && a.saveState.error && <StatusLine tone="error" text={`Couldn’t save your progress with the job: ${a.saveState.error}`} />}
      {/* Kept mounted while the posting is read and while "Which job?" is open, so a failed read, or "← Use another link", gives back the link or text you pasted. */}
      {!a.job && (
        <div hidden={a.phase !== 'idle' || Boolean(a.split) || Boolean(a.overlap)}>
          <StartCard busy={busy} aiReady={aiReady} notReadyText={notReadyText} error={null} onAnalyzeUrls={(urls) => void a.start({ urls })} onUsePasted={(text) => void a.start({ text })} />
        </div>
      )}
      {/* Opened from Jobs ("Analyze") for a job never analyzed: compare its saved posting, or ask for one. */}
      {a.overlap && a.phase === 'idle' ? (
        <LinksOverlap urls={a.overlap.links.map((l) => l.url)} share={a.overlap.share} busy={busy} onContinue={(same) => void a.continueLinks(same)} onBack={a.useAnotherLink} />
      ) : a.split ? (
        <JobSplit candidates={a.split.candidates} source={a.split.source} busy={busy} onAnalyze={(id) => void a.analyzePicked(id)} onBack={a.useAnotherLink} />
      ) : a.job && !s && a.phase === 'idle' && !a.problem ? (
        a.postingText ? (
          <div className={c('a-start')}>
            <h3>No analysis saved for this job yet</h3>
            <p className={c('a-hint')}>The posting is saved with the job. The AI compares it with your blocks, then asks you about the gaps.</p>
            <button className={c('a-btn p')} type="button" disabled={!aiReady} onClick={() => void a.analyzeAgain()}>
              Analyze {a.job.label}
            </button>
            {!aiReady && <p className={c('a-hint')}>{notReadyText}</p>}
          </div>
        ) : (
          <StartCard busy={busy} aiReady={aiReady} notReadyText={notReadyText} error={null} onAnalyzeUrls={(urls) => void a.start({ urls })} onUsePasted={(text) => void a.start({ text })} />
        )
      ) : (
        (a.job || a.phase !== 'idle') && (reviewing ? review() : panels())
      )}
      {views && <AnalysisPopovers a={a} views={views} lines={lines} listItems={listItems} onEdit={openEdit} />}
      {editing && a.job && (
        <ComposeEditor
          editing={editing.editing}
          onChange={(e) => setEditing({ ...editing, editing: e })}
          block={editBlock}
          version={editVersion}
          job={jobAsData(a.job)}
          status={{ text: JSON.stringify(editing.editing) === JSON.stringify(editing.start) ? 'No changes yet.' : 'Changes not saved yet: press Done.', warn: false }}
          copy={editing.target.type === 'draft' ? { ...EDIT_COPY, versionLine: `version “${a.job.label}” · new` } : EDIT_COPY}
          canSave
          busy={false}
          error={null}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
