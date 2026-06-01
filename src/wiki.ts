// STEP 3 — Wikipedia REST client.
//
// Two endpoints are enough for the whole server:
//   1. https://en.wikipedia.org/w/api.php?action=opensearch&search=…
//      → fast title autocomplete, returns [query, titles[], summaries[], urls[]]
//   2. https://en.wikipedia.org/api/rest_v1/page/summary/{title}
//      → REST-style summary with extract + thumbnail (STEP 4)
//   3. https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext
//      → plain-text body of an article (STEP 5)
//
// No API key required. Wikipedia asks every client to set a descriptive
// User-Agent string with a contact URL so they can throttle abuse without
// blocking polite traffic.
const USER_AGENT =
  'mcp-from-zero/0.1 (https://github.com/dev48v/mcp-from-zero; dev48vb@gmail.com)'

async function wikiFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal
    })
    if (!resp.ok) {
      throw new Error(`Wikipedia returned HTTP ${resp.status}`)
    }
    return await resp.json()
  } finally {
    clearTimeout(timeout)
  }
}

// STEP 4 — REST summary. Returns an article's intro paragraph + thumbnail
// in one call (~150 ms). The MediaWiki Action API can do this too via
// prop=extracts&exintro=true but the REST endpoint is one round-trip and
// already gives us a structured payload — preferable for tool output.
export interface SummaryResult {
  title: string
  description: string
  extract: string
  url: string
  thumbnail?: string
}

export async function summary(title: string): Promise<SummaryResult> {
  const u =
    'https://en.wikipedia.org/api/rest_v1/page/summary/' +
    encodeURIComponent(title.replace(/ /g, '_'))
  const data = (await wikiFetch(u)) as {
    title: string
    description?: string
    extract: string
    content_urls: { desktop: { page: string } }
    thumbnail?: { source: string }
  }
  return {
    title: data.title,
    description: data.description ?? '',
    extract: data.extract,
    url: data.content_urls.desktop.page,
    thumbnail: data.thumbnail?.source
  }
}

// STEP 6 — Trending articles (most-viewed on English Wikipedia for the
// previous day). Useful as an MCP "resource" — content the server volunteers
// instead of waiting for a tool call. Resources are great for context the
// model might want to know about before the user has even asked.
export interface TrendingArticle {
  title: string
  rank: number
  views: number
}

export async function trending(): Promise<TrendingArticle[]> {
  // Yesterday's date in YYYY/MM/DD — Wikipedia takes 12-24h to publish
  // aggregated counts, so "yesterday" is the freshest stable bucket.
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${yyyy}/${mm}/${dd}`
  const data = (await wikiFetch(u)) as {
    items: { articles: { article: string; views: number; rank: number }[] }[]
  }
  const items = data.items?.[0]?.articles ?? []
  // Filter out housekeeping pages — "Main_Page", "Special:Search", etc.
  // are always in the top 20 but useless as suggested reading.
  return items
    .filter(a => !a.article.startsWith('Special:') && a.article !== 'Main_Page')
    .slice(0, 20)
    .map(a => ({ title: a.article.replace(/_/g, ' '), rank: a.rank, views: a.views }))
}

// STEP 5 — Full plain-text article body via the Action API.
//
// We deliberately use `prop=extracts&explaintext=1` so the response is
// already markdown-friendly (no HTML tags, no infobox cruft). MediaWiki
// caps individual extract responses at ~10,000 characters but full
// articles can hit that limit easily; the tool layer in index.ts trims
// further to fit inside a typical model context.
export interface ExtractResult {
  title: string
  url: string
  text: string
  truncated: boolean
}

export async function extract(title: string, maxChars = 6000): Promise<ExtractResult> {
  const u = new URL('https://en.wikipedia.org/w/api.php')
  u.searchParams.set('action', 'query')
  u.searchParams.set('format', 'json')
  u.searchParams.set('prop', 'extracts|info')
  u.searchParams.set('inprop', 'url')
  u.searchParams.set('explaintext', '1')
  u.searchParams.set('redirects', '1')
  u.searchParams.set('titles', title)
  const data = (await wikiFetch(u.toString())) as {
    query: { pages: Record<string, { title: string; extract?: string; fullurl?: string; missing?: '' }> }
  }
  const page = Object.values(data.query.pages)[0]
  if (!page || page.missing !== undefined) {
    throw new Error(`Wikipedia article "${title}" not found`)
  }
  const fullText = page.extract ?? ''
  const truncated = fullText.length > maxChars
  const text = truncated ? fullText.slice(0, maxChars).trimEnd() + '…' : fullText
  return {
    title: page.title,
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    text,
    truncated
  }
}

export interface SearchHit {
  title: string
  snippet: string
  url: string
}

// `opensearch` is intentionally low-fidelity (no relevance ranking, just
// title prefix matches) but returns in ~80 ms — perfect for the "give me
// candidate titles" tool call before pulling a full summary.
export async function search(query: string, limit = 8): Promise<SearchHit[]> {
  const u = new URL('https://en.wikipedia.org/w/api.php')
  u.searchParams.set('action', 'opensearch')
  u.searchParams.set('format', 'json')
  u.searchParams.set('search', query)
  u.searchParams.set('limit', String(limit))
  const data = (await wikiFetch(u.toString())) as [
    string,
    string[],
    string[],
    string[]
  ]
  const [, titles, snippets, urls] = data
  return titles.map((title, i) => ({
    title,
    snippet: snippets[i] ?? '',
    url: urls[i] ?? ''
  }))
}
