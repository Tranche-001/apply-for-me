'use client'

import { useRef } from 'react'
import { useOutsideClose, focusFirst } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icons'
import { C, btnP, btnS, cls, segment } from '@/components/ui/styles'
import type { ProfileKind } from '@/features/profile/types'
import { appendTo, moveSection, moveTo } from '../composition'
import { achievementLines, describeFit, plural, type LayoutEntry } from '../layout'
import { AddBlocks } from './add-blocks'
import { AiReport } from './ai-report'
import { ComposeEditor } from './compose-editor'
import { CvPreview, type EntryUi } from './cv-preview'
import { ProfileRow, SectionList } from './cv-rows'
import { FitButton, FitPopup, type FitFix } from './fit-popup'
import { JobPicker } from './job-picker'
import { ProfileDialog } from './profile-dialog'
import { useCompose, type ComposeProps } from './use-compose'

const OTHER_JOB_SOURCES = 5

/** Compose CV: build a CV by hand with a live preview beside it (decision log 2026-11-05). */
export function ComposeView(props: ComposeProps) {
  const s = useCompose(props)
  const { comp, job, fit, profile } = s
  const fitBtn = useRef<HTMLButtonElement>(null)
  const fitPop = useRef<HTMLDivElement>(null)
  useOutsideClose(s.fitOpen, [fitBtn, fitPop], () => s.setFitOpen(false))

  const words = describeFit(fit)
  const fixes: FitFix[] = [...s.fixes]
  if (fit.over && comp.ach && profile.achievements.length) {
    fixes.push({ key: 'ach', text: `Leadership & Achievements: leave it out (${plural(achievementLines(profile), 'line')})`, action: 'Leave out', label: 'Leave Leadership & Achievements out of this CV', onUse: () => s.setComp((c) => ({ ...c, ach: false })) })
  }

  let cvStatus = job ? (job.cv ? `The CV for ${job.label} · ${job.cv.savedLabel.charAt(0).toLowerCase()}${job.cv.savedLabel.slice(1)}` : '') : 'Pick a job, or create one, to save this CV.'
  if (job && s.dirty) cvStatus = s.hasSaved ? `Unsaved changes to the CV for ${job.label}.` : `No CV saved for ${job.label} yet.`

  const otherJobs = s.jobs.filter((j) => j.cv && j.id !== job?.id)
  const shownOthers = otherJobs.slice(0, OTHER_JOB_SOURCES)
  const currentOther = s.source.startsWith('job:') ? otherJobs.find((j) => `job:${j.id}` === s.source) : null
  const sourceOptions = [
    { value: 'saved', label: s.hasSaved ? 'Saved CV for this job' : 'Saved CV for this job (none yet)', disabled: !s.hasSaved },
    ...(s.source === 'ai' ? [{ value: 'ai', label: 'AI draft for this job', disabled: false }] : []),
    ...(s.source === 'keep' ? [{ value: 'keep', label: 'The CV you had open', disabled: false }] : []),
    { value: 'full', label: 'Every block (like CVFINALVISIO.tex)', disabled: false },
    { value: 'empty', label: 'An empty CV', disabled: false },
    ...[...shownOthers, ...(currentOther && !shownOthers.includes(currentOther) ? [currentOther] : [])].map((j) => ({ value: `job:${j.id}`, label: `CV for ${j.label}`, disabled: false })),
  ]

  const entryUi = (e: LayoutEntry): EntryUi => {
    const id = e.block.id
    if (id === '__new') return {}
    let highlight: EntryUi['highlight'] = 'none'
    if (s.hoverId === id || s.verOpen === id) highlight = 'hover'
    if (s.flashId === id) highlight = 'flash'
    if (e.peeked) highlight = 'peek'
    return { highlight, onClick: () => s.openFromPreview(id), onDoubleClick: () => s.openEdit(id), title: `Click to switch the version of ${e.block.name}, double-click to edit it` }
  }

  const openProfile = (kind: ProfileKind) => {
    s.setProfOpen(kind)
    s.setFitOpen(false)
    s.setVerOpen(null)
    focusFirst(['pf-pop'])
  }

  const editStatus = (() => {
    if (!s.editing) return { text: '', warn: false }
    if (!s.editChanged) return { text: s.editing.kind === 'new' ? 'Add a name and a title.' : 'No changes yet.', warn: false }
    return fit.over
      ? { text: `With these changes the CV is about ${plural(fit.excessLines, 'line')} too long for ${plural(fit.limit, 'page')}.`, warn: true }
      : { text: `With these changes it fits on ${plural(fit.pageCount, 'page')}, the last one ${fit.pct}% full.`, warn: false }
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 12px' }}>
          <p className="eyebrow">COMPOSE</p>
          <h1 className="page-title">Build a CV block by block</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <JobPicker
            jobs={s.jobs}
            current={job}
            open={s.jobOpen}
            onOpenChange={(open) => {
              s.setJobOpen(open)
              if (!open) s.setPendingJobId(null)
              if (open) s.setFitOpen(false)
            }}
            pendingJob={s.pendingJob}
            onPick={s.pickJob}
            onCancelPending={() => s.setPendingJobId(null)}
            onSwitchNoSave={() => s.pendingJob && s.switchJob(s.pendingJob.id)}
            onSaveAndSwitch={() => void s.saveAndSwitch()}
            onCreate={s.create}
          />
          <div role="group" aria-label="Length" style={{ display: 'flex', padding: 3, gap: 3, borderRadius: 8, background: '#E6E7EA' }}>
            <button type="button" onClick={() => s.setComp((c) => ({ ...c, pages: 1 }))} aria-pressed={comp.pages === 1} style={segment(comp.pages === 1)}>1 page</button>
            <button type="button" onClick={() => s.setComp((c) => ({ ...c, pages: 2 }))} aria-pressed={comp.pages === 2} style={segment(comp.pages === 2)}>2 pages</button>
          </div>
          <button type="button" className={cls.btnS} onClick={() => void s.generate()} aria-disabled={s.genBusy || !job} disabled={!job} style={btnS(32, { padding: '0 12px', border: `1px solid ${C.indigoLine}`, color: C.indigoInk, fontWeight: 600 })}>
            <Icon name="sparkle" />
            <span aria-live="polite">{s.genBusy ? 'Writing…' : s.hasSaved ? 'Regenerate' : 'Generate'}</span>
            <span className="sr-only"> with AI</span>
          </button>
          <button type="button" className={cls.btnP} onClick={() => void s.save()} disabled={!job || s.saving} title={job ? undefined : 'Pick or create a job to save this CV'} style={btnP(32)}>
            <Icon name="check" />
            <span aria-live="polite">{s.saving ? 'Saving…' : s.dirty ? 'Save CV' : 'Saved'}</span>
          </button>
          <button type="button" disabled title="PDF export isn’t built yet" style={btnS(32, { gap: 5 })}>
            <Icon name="download" size={13} />
            PDF
          </button>
          <button type="button" disabled title=".tex export isn’t built yet" style={btnS(32, { gap: 5 })}>
            <Icon name="download" size={13} />
            .tex
          </button>
        </div>
      </header>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        <section aria-labelledby="cv-h" style={{ flex: '0 1 430px', minWidth: 320, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto', boxSizing: 'border-box', background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 5, margin: '0 -12px', padding: '12px 12px 8px', background: '#FFFFFF', borderBottom: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2 id="cv-h" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>This CV</h2>
                {fit.over && (
                  <FitButton
                    ref={fitBtn}
                    title={words.title}
                    open={s.fitOpen}
                    onToggle={() => {
                      const open = !s.fitOpen
                      s.setFitOpen(open)
                      s.setJobOpen(false)
                      if (open) focusFirst(['fit-pop'])
                    }}
                  />
                )}
                <span role="status" className="sr-only">{fit.over ? `${words.title}. ${words.detail}` : words.title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="cv-src" style={{ fontSize: 11.5, color: C.muted }}>Start from</label>
                <select id="cv-src" value={s.source} onChange={(ev) => s.load(ev.target.value)} style={{ height: 28, maxWidth: 210, boxSizing: 'border-box', padding: '0 6px', border: `1px solid ${C.borderStrong}`, borderRadius: 6, background: '#FFFFFF', fontSize: 12 }}>
                  {sourceOptions.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px', fontSize: 11.5, lineHeight: 1.4, color: C.text2 }}>
              <span aria-hidden="true" style={{ flex: '0 0 auto', width: 7, height: 7, borderRadius: '50%', background: s.dirty ? C.warn : C.ok }} />
              <span>{cvStatus}</span>
              {s.dirty && s.hasSaved && (
                <button type="button" onClick={() => s.load('saved')} style={{ padding: 0, border: 0, background: 'transparent', fontSize: 11.5, fontWeight: 500, color: C.indigo, textDecoration: 'underline' }}>
                  Revert to saved
                </button>
              )}
            </p>
            {s.saveError && <p role="alert" style={{ margin: 0, fontSize: 11.5, color: C.danger }}>{s.saveError}</p>}
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: C.muted }}>Click a block here, or double-click it on the page, to edit it. Drag or use the arrows to reorder.</p>
            {s.fitOpen && !s.editing && (
              <FitPopup
                ref={fitPop}
                fit={fit}
                title={words.title}
                detail={words.detail}
                fixes={fixes}
                onAllowTwo={fit.over && comp.pages === 1 ? () => s.setComp((c) => ({ ...c, pages: 2 })) : null}
                onClose={() => {
                  s.setFitOpen(false)
                  s.setPeek(null)
                  focusFirst(['fit-btn', 'cv-src'])
                }}
                onUnpeek={() => s.setPeek(null)}
              />
            )}
          </div>

          {s.ai && s.ai.jobId === job?.id && (
            <AiReport
              run={s.ai}
              open={s.aiOpen}
              canUndo={!s.ai.error && !!s.undo}
              dirty={s.dirty}
              busy={s.genBusy}
              onToggle={() => s.setAiOpen(!s.aiOpen)}
              onUndo={s.undoAi}
              onDismiss={() => {
                s.setAi(null)
                s.setAiOpen(false)
                s.setUndo(null)
              }}
              onRetry={() => void s.generate()}
              onAsk={s.setAsk}
              onSendAsk={(a) => void s.sendAsk(a)}
            />
          )}

          <ProfileRow kind="education" checked={comp.edu} onToggle={() => s.setComp((c) => ({ ...c, edu: !c.edu }))} onEdit={() => openProfile('education')} open={s.profOpen === 'education'} />
          <SectionList
            comp={comp}
            blocks={s.blocks}
            jobId={s.jobId}
            verOpen={s.verOpen}
            verQuery={s.verQuery}
            hoverId={s.hoverId}
            flashId={s.flashId}
            drag={s.drag}
            onVerQuery={s.setVerQuery}
            onToggleVer={(id) => {
              s.setVerOpen(s.verOpen === id ? null : id)
              s.setVerQuery('')
              s.setPeek(null)
            }}
            onCloseVer={() => {
              s.setVerOpen(null)
              s.setPeek(null)
            }}
            onPickVersion={s.setVer}
            onPeek={(blockId, versionId) => {
              if (s.peek?.blockId !== blockId || s.peek.versionId !== versionId) s.setPeek({ blockId, versionId })
            }}
            onUnpeek={() => s.peek && s.setPeek(null)}
            onMove={s.move}
            onMoveSection={(section, dir) => s.setComp((c) => moveSection(c, section, dir))}
            onRemove={s.remove}
            onEdit={s.openEdit}
            onHover={s.setHoverId}
            onDrag={s.setDrag}
            onDropOnRow={(from, to) => {
              s.setComp((c) => moveTo(c, from, to))
              s.flash(from)
            }}
            onDropOnSection={(from, section) => {
              s.setComp((c) => appendTo(c, from, section))
              s.flash(from)
            }}
          />
          <ProfileRow kind="skills" checked={comp.skills} onToggle={() => s.setComp((c) => ({ ...c, skills: !c.skills }))} onEdit={() => openProfile('skills')} open={s.profOpen === 'skills'} />
          <ProfileRow kind="achievements" checked={comp.ach} onToggle={() => s.setComp((c) => ({ ...c, ach: !c.ach }))} onEdit={() => openProfile('achievements')} open={s.profOpen === 'achievements'} />

          <AddBlocks library={s.library} comp={comp} jobId={s.jobId} query={s.libQuery} onQuery={s.setLibQuery} onAdd={s.add} onNewBlock={s.startNewBlock} />
        </section>

        <section aria-label="Live CV preview" style={{ flex: '1 1 480px', minWidth: 0, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto', boxSizing: 'border-box', padding: '12px 12px 16px', borderRadius: 10, background: C.previewBg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <CvPreview layout={s.shown.layout} profile={profile} labels={s.shown.labels} entryUi={entryUi} onProfileClick={openProfile} />
        </section>
      </div>

      {s.profOpen && <ProfileDialog kind={s.profOpen} store={s.store} onClose={() => s.setProfOpen(null)} />}
      {s.editing && (
        <ComposeEditor
          editing={s.editing}
          onChange={s.setEditing}
          block={s.editBlock}
          version={s.editVersion}
          job={job}
          status={editStatus}
          canSave={s.editChanged}
          busy={s.editBusy}
          error={s.editError}
          onSave={() => void s.saveEdit()}
          onCancel={() => s.setEditing(null)}
        />
      )}
    </div>
  )
}
