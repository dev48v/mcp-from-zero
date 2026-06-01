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
