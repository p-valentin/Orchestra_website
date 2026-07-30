import NotesEditor from '@/components/NotesEditor'
import { listPosts, type BlogPost } from '@/lib/blog'
import {
  deletePostAction,
  publishPostAction,
  savePostAction,
  unpublishPostAction,
} from '@/app/admin/actions'
import { btn, card, input, section } from './ui'

function PostRow({ post }: { post: BlogPost }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-lg text-fg">{post.title}</span>
        {post.publishedAt ? (
          <span className="rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] text-ok">published</span>
        ) : (
          <span className="rounded-full bg-well px-2.5 py-0.5 font-mono text-[11px] text-faint">draft</span>
        )}
        <span className="font-mono text-xs text-faint">/blog/{post.slug}</span>
        <div className="ml-auto flex items-center gap-2">
          {post.publishedAt ? (
            <>
              <a href={`/blog/${post.slug}`} className="font-mono text-xs text-muted hover:text-fg">view →</a>
              <form action={unpublishPostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} border border-line-strong text-muted hover:text-fg`}>Unpublish</button>
              </form>
            </>
          ) : (
            <>
              <form action={publishPostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} bg-brass text-[#1a1306] hover:bg-brass-bright`}>Publish</button>
              </form>
              <form action={deletePostAction}>
                <input type="hidden" name="slug" value={post.slug} />
                <button className={`${btn} border border-line text-faint hover:border-[#e06c63]/60 hover:text-[#f0a8a2]`}>Delete</button>
              </form>
            </>
          )}
        </div>
      </div>
      {post.description && <p className="mt-1 text-sm text-faint">{post.description}</p>}
      {(post.tags?.length ?? 0) > 0 && (
        <p className="mt-1 font-mono text-[11px] text-faint">{post.tags!.join(' · ')}</p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs text-faint hover:text-muted">edit post</summary>
        <form action={savePostAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="slug" value={post.slug} />
          <input name="title" defaultValue={post.title} required maxLength={120} className={`${input} w-full max-w-xl`} />
          <input name="description" defaultValue={post.description} maxLength={200} placeholder="one-line description (meta + list page)" className={`${input} w-full max-w-xl`} />
          <input name="tags" defaultValue={(post.tags ?? []).join(', ')} maxLength={400} placeholder="tags, comma-separated — shown on the post and fed to SEO keywords" className={`${input} w-full max-w-xl`} />
          <NotesEditor key={post.updatedAt} name="body" rows={14} defaultValue={post.body} preview="article" />
          <button className={`${btn} self-start border border-brass/50 text-brass-bright hover:bg-brass hover:text-[#1a1306]`}>
            Save post
          </button>
        </form>
      </details>
    </div>
  )
}

export default async function BlogTab() {
  const posts = await listPosts()
  const drafts = posts.filter(p => !p.publishedAt).length

  return (
    <section id="blog" className={section}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Blog</h2>
        <span className="font-mono text-xs text-faint">
          {posts.filter(p => p.publishedAt).length} published · drafts are invisible on /blog
        </span>
      </div>

      {drafts > 0 && (
        <p className="mt-3 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm text-brass-bright">
          {drafts} unpublished {drafts === 1 ? 'draft' : 'drafts'}. Drafts are not in the sitemap and cannot rank —
          if any of them target a search query, publishing is the single highest-value SEO action available here.
        </p>
      )}

      <div className={`${card} mt-4`}>
        <h3 className="font-display text-lg font-medium">New post</h3>
        <form action={savePostAction} className="mt-3 flex flex-col gap-2">
          <input name="title" placeholder="Post title" required maxLength={120} className={`${input} w-full max-w-xl`} />
          <input name="description" placeholder="one-line description (meta + list page)" maxLength={200} className={`${input} w-full max-w-xl`} />
          <input name="tags" placeholder="tags, comma-separated — shown on the post and fed to SEO keywords" maxLength={400} className={`${input} w-full max-w-xl`} />
          <NotesEditor
            key={posts.length}
            name="body"
            rows={10}
            preview="article"
            placeholder={'Write in markdown. First save creates a draft; publish when ready.'}
          />
          <button className={`${btn} self-start bg-brass text-[#1a1306] hover:bg-brass-bright`}>Save draft</button>
        </form>
      </div>

      <div className={`${card} mt-4`}>
        {posts.length === 0 ? (
          <p className="text-sm text-faint">No posts yet — write one above.</p>
        ) : (
          posts.map(p => <PostRow key={p.slug} post={p} />)
        )}
      </div>
    </section>
  )
}
