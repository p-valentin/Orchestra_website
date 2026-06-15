import { readJson, writeJson } from './store'

export type FeedbackKind = 'bug' | 'feature' | 'other' | 'testimonial'

export interface FeedbackEntry {
  id: string
  kind: FeedbackKind
  name?: string
  email?: string
  handle?: string
  message: string
  meta?: { version?: string; platform?: string; arch?: string; ts?: string }
  logs?: string
  at: string // ISO timestamp
}

interface FeedbackFile { entries: FeedbackEntry[] }

const KEY = 'site/feedback.json'
const KEEP = 500
const EMPTY: FeedbackFile = { entries: [] }

export async function readFeedback(): Promise<FeedbackEntry[]> {
  const file = await readJson<FeedbackFile>(KEY, EMPTY)
  return Array.isArray(file.entries) ? file.entries : []
}

export async function appendFeedback(entry: FeedbackEntry): Promise<boolean> {
  const entries = await readFeedback()
  entries.push(entry)
  return writeJson(KEY, { entries: entries.slice(-KEEP) })
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const entries = await readFeedback()
  const next = entries.filter(e => e.id !== id)
  if (next.length === entries.length) return true // already gone — idempotent
  return writeJson(KEY, { entries: next })
}
