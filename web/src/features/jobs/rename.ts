// Renaming a job on the Jobs screen (pure): what blocks it, and what to say after it.

/** Why the new name can't be saved, in plain words; null when it can (same limits as renameJob). */
export function renameProblem(draft: { company: string; role: string }): string | null {
  if (!draft.role.trim()) return 'Write the role: a job needs at least a role.'
  if (draft.company.trim().length > 120) return 'Keep the company under 120 characters.'
  if (draft.role.trim().length > 160) return 'Keep the role under 160 characters.'
  return null
}

/** The line shown after a rename: which versions took the new name (they were named after the job). */
export function renameNote(before: string, after: string, renamedVersions: number): string {
  if (before === after) return ''
  return renamedVersions > 0 ? `Renamed. Versions named “${before}” now use “${after}”.` : 'Renamed.'
}
