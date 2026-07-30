// The canonical origin, in one place.
//
// Production serves on www; the apex 308-redirects to it. Every URL the site
// declares about itself — canonicals, the sitemap, robots' sitemap pointer,
// JSON-LD — used to name the APEX, so Google was handed 31 sitemap URLs that
// all answered with a redirect and 31 canonicals that disagreed with the host
// that served them. That is an indexing tax on every page, paid silently.
//
// One constant, so the two can never drift apart again. If the canonical host
// ever changes, it changes here and the sitemap, robots and structured data
// follow — rather than in six files, five of which get remembered.
export const SITE_URL = 'https://www.orchestra-automation.com'

// Bare host, for copy that shows the domain rather than links to it.
export const SITE_HOST = 'www.orchestra-automation.com'

export function absoluteUrl(path = '/'): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
