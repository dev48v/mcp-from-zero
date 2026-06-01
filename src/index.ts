#!/usr/bin/env node
// STEP 7 — Final server with three tools, one resource, and proper error
// handling + structured outputs.
//
// MCP tool handlers should NEVER let an exception escape — the SDK catches
// them but the resulting CallToolResult is opaque. We wrap each handler with
// `safeTool` so failures come back as `{ isError: true, content: [text…] }`
// — the model sees the error message and can recover (try a different
// title, ask the user to clarify, etc).
//
// We also set `structuredContent` on every tool result. MCP clients that
// support it (Claude Code, Cursor) can consume the typed JSON directly
// instead of re-parsing the text — much more reliable than regex on prose.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { search, summary, extract, trending } from './wiki.js'

const server = new McpServer({
  name: 'mcp-from-zero',
  version: '0.1.0'
})

// Helper that turns any thrown error into a friendly MCP error response.
// The model sees the message and can decide to retry with different
// arguments — much better UX than the SDK's default opaque failure.
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}
async function safeTool<T>(work: () => Promise<T>, render: (r: T) => ToolResult): Promise<ToolResult> {
  try {
    const r = await work()
    return render(r)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [{ type: 'text', text: `Tool failed: ${message}` }]
    }
  }
}

server.tool(
  'wiki_search',
  'Search Wikipedia for article titles matching a query. Returns up to N hits with titles, snippets, and URLs. Use this when the user wants to find Wikipedia articles by topic — then call wiki_summary or wiki_extract with the chosen title.',
  {
    query: z.string().min(1).describe('Search query, e.g. "WebAssembly" or "Marie Curie".'),
    limit: z.number().int().min(1).max(20).default(8)
      .describe('Maximum number of hits to return (1-20). Default 8.')
  },
  async ({ query, limit }) =>
    safeTool(
      () => search(query, limit),
      hits => {
        if (hits.length === 0) {
          return {
            content: [{ type: 'text', text: `No Wikipedia articles found for "${query}".` }],
            structuredContent: { query, hits: [] }
          }
        }
        const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}`)
        return {
          content: [{ type: 'text', text: `Found ${hits.length} matches for "${query}":\n\n${lines.join('\n')}` }],
          structuredContent: { query, hits }
        }
      }
    )
)

server.tool(
  'wiki_summary',
  'Fetch the intro paragraph + metadata for a Wikipedia article by title. Use this after wiki_search picks a candidate title — gives the AI client enough context to answer "what is X?" style questions without pulling the full article body.',
  {
    title: z.string().min(1).describe('Exact Wikipedia article title, e.g. "WebAssembly" or "Marie Curie".')
  },
  async ({ title }) =>
    safeTool(
      () => summary(title),
      s => {
        const meta = s.description ? `${s.description}\n\n` : ''
        return {
          content: [{ type: 'text', text: `# ${s.title}\n\n${meta}${s.extract}\n\nSource: ${s.url}` }],
          structuredContent: s as unknown as Record<string, unknown>
        }
      }
    )
)

server.tool(
  'wiki_extract',
  'Fetch the full plain-text body of a Wikipedia article (truncated to a character budget). Use this when the user wants the AI to read or summarise a whole article — e.g. "summarise the Wikipedia article on entropy". The output indicates whether the body was truncated.',
  {
    title: z.string().min(1).describe('Exact Wikipedia article title.'),
    max_chars: z.number().int().min(500).max(20_000).default(6000)
      .describe('Maximum characters to return (500-20000). Larger = more context, slower + more tokens. Default 6000.')
  },
  async ({ title, max_chars }) =>
    safeTool(
      () => extract(title, max_chars),
      r => {
        const footer = r.truncated
          ? `\n\n[truncated at ${max_chars} chars — call again with a larger max_chars for more]`
          : ''
        return {
          content: [{ type: 'text', text: `# ${r.title}\n\n${r.text}${footer}\n\nSource: ${r.url}` }],
          structuredContent: r as unknown as Record<string, unknown>
        }
      }
    )
)

// MCP resource — yesterday's top-20 trending Wikipedia articles.
server.resource(
  'wiki-trending',
  'wiki://trending',
  {
    title: 'Wikipedia trending articles',
    description: 'Top 20 most-viewed English Wikipedia articles from yesterday.',
    mimeType: 'text/plain'
  },
  async uri => {
    try {
      const items = await trending()
      const text = items.map(i =>
        `${i.rank.toString().padStart(2)}. ${i.title}  —  ${i.views.toLocaleString()} views`
      ).join('\n')
      return {
        contents: [{ uri: uri.toString(), mimeType: 'text/plain', text }]
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        contents: [{ uri: uri.toString(), mimeType: 'text/plain', text: `Resource fetch failed: ${message}` }]
      }
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('mcp-from-zero ready on stdio')
}

main().catch(err => {
  console.error('fatal:', err)
  process.exit(1)
})
