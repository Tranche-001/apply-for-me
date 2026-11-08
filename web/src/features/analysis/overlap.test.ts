import { describe, expect, test } from 'vitest'
import { OVERLAP_THRESHOLD, keepOneCopy, linkLabel, overlapShare, sameJobShare } from './overlap'

const PROGRAM = [
  'Programa de Estágio - GenAI',
  'O iFood está com inscrições abertas para o programa.',
  'Trilha AI Engineer',
  'Construir agentes com LLMs em produção para milhões de pedidos.',
  'Trilha AI Builder',
  'Criar soluções de IA para as áreas de negócio do iFood.',
  'Estar regularmente matriculado(a) em curso superior.',
  'Bolsa auxílio compatível com o mercado e vale-refeição.',
].join('\n')

describe('overlapShare', () => {
  test('the same text is a full overlap', () => {
    expect(overlapShare(PROGRAM, PROGRAM)).toBe(1)
  })

  test('the shorter text inside a longer page (menus, footers around it) is still a full overlap', () => {
    const page = `Home\nVagas\nEntrar\n${PROGRAM}\nPolítica de privacidade do iFood e termos de uso.\n© iFood 2026`
    expect(overlapShare(PROGRAM, page)).toBe(1)
    expect(overlapShare(page, PROGRAM)).toBe(1)
  })

  test('case, accents of whitespace and punctuation do not matter', () => {
    const shouty = PROGRAM.toUpperCase().replace(/\n/g, '  \n ').replace(/\./g, '')
    expect(overlapShare(PROGRAM, shouty)).toBe(1)
  })

  test('two different postings share little', () => {
    const other = [
      'Backend Engineer at Acme',
      'You will build payment APIs in Go for our merchants.',
      'Five years of experience with distributed systems.',
      'Bolsa auxílio compatível com o mercado e vale-refeição.',
    ].join('\n')
    expect(overlapShare(PROGRAM, other)).toBeLessThan(OVERLAP_THRESHOLD)
  })

  test('short lines (menus, single words) are ignored; too few real lines is never an overlap', () => {
    expect(overlapShare('Home\nVagas\nEntrar', 'Home\nVagas\nEntrar')).toBe(0)
    expect(overlapShare('One real sentence that is long enough.', 'One real sentence that is long enough.')).toBe(0)
  })
})

describe('sameJobShare', () => {
  const page = (url: string, text: string) => ({ url, text })

  test('two links whose texts mostly repeat: the share', () => {
    expect(sameJobShare([page('https://a.example/1', PROGRAM), page('https://b.example/2', `${PROGRAM}\nMais uma linha diferente nesta página.`)])).toBeGreaterThanOrEqual(OVERLAP_THRESHOLD)
  })

  test('null for one link, or for links that do not repeat each other', () => {
    expect(sameJobShare([page('https://a.example/1', PROGRAM)])).toBeNull()
    const other = 'Backend Engineer at Acme\nYou will build payment APIs in Go.\nFive years of experience with distributed systems.\nWe offer remote work.'
    expect(sameJobShare([page('https://a.example/1', PROGRAM), page('https://b.example/2', other)])).toBeNull()
  })

  test('three links: every one must repeat the longest, else null', () => {
    const other = 'Backend Engineer at Acme\nYou will build payment APIs in Go.\nFive years of experience with distributed systems.\nWe offer remote work.'
    expect(sameJobShare([page('https://a.example/1', PROGRAM), page('https://b.example/2', PROGRAM), page('https://c.example/3', other)])).toBeNull()
    expect(sameJobShare([page('https://a.example/1', PROGRAM), page('https://b.example/2', PROGRAM), page('https://c.example/3', PROGRAM)])).toBe(1)
  })
})

describe('keepOneCopy', () => {
  test('the longest text wins; the first one on a tie', () => {
    expect(keepOneCopy([{ url: 'a', text: 'short' }, { url: 'b', text: 'longer text' }, { url: 'c', text: 'mid text' }])).toBe('longer text')
    expect(keepOneCopy([{ url: 'a', text: 'same' }, { url: 'b', text: 'same' }])).toBe('same')
  })
})

describe('linkLabel', () => {
  test('host and path, without www, the protocol or the query', () => {
    expect(linkLabel('https://www.carreiras.ifood.com.br/gen-ai/?utm=x')).toBe('carreiras.ifood.com.br/gen-ai/')
    expect(linkLabel('https://carreiras.ifood.com.br/job/8901054002/')).toBe('carreiras.ifood.com.br/job/8901054002/')
    expect(linkLabel('https://jobs.example.com/')).toBe('jobs.example.com')
    expect(linkLabel('not a url')).toBe('not a url')
  })
})
