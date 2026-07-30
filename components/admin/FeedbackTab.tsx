import FeedbackPanel from '@/components/FeedbackPanel'
import { readFeedback } from '@/lib/feedback'
import { section } from './ui'

export default async function FeedbackTab() {
  const feedback = await readFeedback()
  return (
    <section id="feedback" className={section}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Feedback &amp; testimonials</h2>
        <span className="font-mono text-xs text-faint">{feedback.length} total · from the desktop app</span>
      </div>
      <div className="mt-4">
        <FeedbackPanel entries={feedback} />
      </div>
    </section>
  )
}
