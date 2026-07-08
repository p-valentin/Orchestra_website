import { readJson, writeJson } from './store'

// Blog posts, admin-authored markdown stored like releases.ts: one JSON file,
// drafts invisible until published. Slugs are derived from the title once at
// creation and stay stable afterwards so published URLs never break.

export interface BlogPost {
  slug: string
  title: string
  description: string
  body: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

const KEY = 'site/blog.json'

interface BlogFile {
  posts: BlogPost[]
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 80)
    .replace(/-+$/, '')
}

export async function listPosts(): Promise<BlogPost[]> {
  const data = await readJson<BlogFile>(KEY, { posts: [] })
  return data.posts.sort((a, b) => {
    const at = a.publishedAt ?? a.createdAt
    const bt = b.publishedAt ?? b.createdAt
    return bt.localeCompare(at)
  })
}

export async function publishedPosts(): Promise<BlogPost[]> {
  return (await listPosts()).filter(p => p.publishedAt)
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const data = await readJson<BlogFile>(KEY, { posts: [] })
  return data.posts.find(p => p.slug === slug) ?? null
}

// Creates the post when the slug is new, otherwise updates title/description/
// body in place. Publish state is only ever changed via setPostPublished.
export async function savePost(input: {
  slug: string
  title: string
  description: string
  body: string
}): Promise<boolean> {
  if (!SLUG_RE.test(input.slug)) return false
  const data = await readJson<BlogFile>(KEY, { posts: [] })
  const now = new Date().toISOString()
  const existing = data.posts.find(p => p.slug === input.slug)
  if (existing) {
    existing.title = input.title
    existing.description = input.description
    existing.body = input.body
    existing.updatedAt = now
  } else {
    data.posts.push({ ...input, createdAt: now, updatedAt: now, publishedAt: null })
  }
  return writeJson(KEY, data)
}

export async function setPostPublished(slug: string, published: boolean): Promise<boolean> {
  const data = await readJson<BlogFile>(KEY, { posts: [] })
  const post = data.posts.find(p => p.slug === slug)
  if (!post) return false
  post.publishedAt = published ? new Date().toISOString() : null
  post.updatedAt = new Date().toISOString()
  return writeJson(KEY, data)
}

export async function deletePost(slug: string): Promise<boolean> {
  const data = await readJson<BlogFile>(KEY, { posts: [] })
  data.posts = data.posts.filter(p => p.slug !== slug)
  return writeJson(KEY, data)
}
