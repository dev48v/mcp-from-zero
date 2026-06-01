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
import { search } from './wiki.js'

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

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('mcp-from-zero ready on stdio')
}

main().catch(err => {
  console.error('fatal:', err)
  process.exit(1)
})
