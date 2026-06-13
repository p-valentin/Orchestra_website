'use client'

import { useState } from 'react'
import ReleaseNotes from './ReleaseNotes'

export default function NotesEditor({
  name,
  defaultValue,
  placeholder,
  rows,
}: {
  name: string
  defaultValue?: string
  placeholder?: string
  rows: number
}) {
  const [text, setText] = useState(defaultValue ?? '')

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={e => setText(e.target.value)}
        className="w-full rounded-lg border border-line-strong bg-well px-3 py-2 font-mono text-sm text-fg outline-none focus:border-brass"
      />
      <div className="rounded-lg border border-line-strong bg-well px-3 py-2 overflow-auto">
        {text.trim() ? (
          <ReleaseNotes text={text} />
        ) : (
          <p className="text-sm text-faint">Preview will appear here.</p>
        )}
      </div>
    </div>
  )
}
