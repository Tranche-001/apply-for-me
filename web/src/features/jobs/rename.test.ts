import { describe, expect, test } from 'vitest'
import { renameNote, renameProblem } from './rename'

describe('renameProblem', () => {
  test('a job needs a role; the company may be empty', () => {
    expect(renameProblem({ company: 'ExampleCo', role: '  ' })).toBe('Write the role: a job needs at least a role.')
    expect(renameProblem({ company: '', role: 'Tool Builder' })).toBeNull()
    expect(renameProblem({ company: 'ExampleCo', role: 'Staff GenAI Engineer' })).toBeNull()
  })

  test('names stay as short as the server accepts', () => {
    expect(renameProblem({ company: 'x'.repeat(121), role: 'Engineer' })).toBe('Keep the company under 120 characters.')
    expect(renameProblem({ company: 'ExampleCo', role: 'r'.repeat(161) })).toBe('Keep the role under 160 characters.')
  })
})

describe('renameNote', () => {
  test('says which versions took the new name', () => {
    expect(renameNote('ExampleCo · Senior GenAI Engineer', 'ExampleCo · Staff GenAI Engineer', 2)).toBe(
      'Renamed. Versions named “ExampleCo · Senior GenAI Engineer” now use “ExampleCo · Staff GenAI Engineer”.',
    )
  })

  test('just "Renamed." when no version had the old name, and nothing when the name did not change', () => {
    expect(renameNote('A · B', 'A · C', 0)).toBe('Renamed.')
    expect(renameNote('A · B', 'A · B', 0)).toBe('')
  })
})
