#!/usr/bin/env node
// STEP 3 — Register the first MCP tool: wiki_search.
//
// Tool registration shape on McpServer:
//   server.tool(name, description, schema, handler)
// — `schema` is a Zod object (raw shape, not z.object(...)) — McpServer
// converts it to JSON Schema for the tools/list response automatically.
// — The handler returns `{ content: [...] }` where each content item is a
// MCP content block (text / image / resource_link).
//
// STEPS 4-5 add wiki_summary + wiki_extract. STEP 6 adds a resource.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { search, summary, extract, trending } from './wiki.js'

const server = new McpServer({
  name: 'mcp-from-zero',
  version: '0.1.0'
})

server.tool(
  'wiki_search',
  'Search Wikipedia for article titles matching a query. Returns up to N hits with titles, snippets, and URLs. Use this when the user wants to find Wikipedia articles by topic — then call wiki_summary or wiki_extract with the chosen title.',
  {
    query: z.string().min(1).describe('Search query, e.g. "WebAssembly" or "Marie Curie".'),
    limit: z.number().int().min(1).max(20).default(8)
      .describe('Maximum number of hits to return (1-20). Default 8.')
  },
  async ({ query, limit }) => {
    const hits = await search(query, limit)
    if (hits.length === 0) {
      return {
        content: [{ type: 'text', text: `No Wikipedia articles found for "${query}".` }]
      }
    }
    const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}`)
    return {
      content: [
        { type: 'text', text: `Found ${hits.length} matches for "${query}":\n\n${lines.join('\n')}` }
      ]
    }
  }
)

server.tool(
  'wiki_summary',
  'Fetch the intro paragraph + metadata for a Wikipedia article by title. Use this after wiki_search picks a candidate title — gives the AI client enough context to answer "what is X?" style questions without pulling the full article body.',
  {
    title: z.string().min(1).describe('Exact Wikipedia article title, e.g. "WebAssembly" or "Marie Curie".')
  },
  async ({ title }) => {
    const s = await summary(title)
    const meta = s.description ? `${s.description}\n\n` : ''
    return {
      content: [
        {
          type: 'text',
          text: `# ${s.title}\n\n${meta}${s.extract}\n\nSource: ${s.url}`
        }
      ]
    }
  }
)

server.tool(
  'wiki_extract',
  'Fetch the full plain-text body of a Wikipedia article (truncated to a character budget). Use this when the user wants the AI to read or summarise a whole article — e.g. "summarise the Wikipedia article on entropy". The output indicates whether the body was truncated.',
  {
    title: z.string().min(1).describe('Exact Wikipedia article title.'),
    max_chars: z.number().int().min(500).max(20_000).default(6000)
      .describe('Maximum characters to return (500-20000). Larger = more context, slower + more tokens. Default 6000.')
  },
  async ({ title, max_chars }) => {
    const r = await extract(title, max_chars)
    const footer = r.truncated
      ? `\n\n[truncated at ${max_chars} chars — call again with a larger max_chars for more]`
      : ''
    return {
      content: [
        {
          type: 'text',
          text: `# ${r.title}\n\n${r.text}${footer}\n\nSource: ${r.url}`
        }
      ]
    }
  }
)

// STEP 6 — Expose a resource. Resources are MCP's answer to "static or
// slowly-changing context the client might want to pull on its own."
// Unlike tools (the model decides to call them), resources are listed up
// front and the client can fetch them whenever — without sending a request
// to the model. Great for things like config, recent activity, glossaries.
//
// `wiki://trending` is dynamic but cheap to refresh; resource fetches do
// not consume model tokens until the client decides to inject the content
// into the conversation.
server.resource(
  'wiki-trending',
  'wiki://trending',
  {
    title: 'Wikipedia trending articles',
    description: 'Top 20 most-viewed English Wikipedia articles from yesterday.',
    mimeType: 'text/plain'
  },
  async uri => {
    const items = await trending()
    const text = items.map(i =>
      `${i.rank.toString().padStart(2)}. ${i.title}  —  ${i.views.toLocaleString()} views`
    ).join('\n')
    return {
      contents: [
        { uri: uri.toString(), mimeType: 'text/plain', text }
      ]
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
