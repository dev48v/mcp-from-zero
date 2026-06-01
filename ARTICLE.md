---
title: "I Built a Custom Tool Server for Claude in 250 Lines of TypeScript"
published: true
description: "Day 40 of TechFromZero. The Model Context Protocol is the USB-C of AI integrations. Build one server, plug into Claude Desktop, Cursor, Continue, Zed — every MCP client speaks the same wire. Here is the whole thing in 250 lines."
tags: ai, anthropic, typescript, beginners
series: TechFromZero
---

Open Claude Desktop. Ask it: *"What's on the Wikipedia article about WebAssembly?"*

Without any plugin, it'll guess from training data. With the server I'm about to show you, it'll call a tool named `wiki_extract`, fetch the real article live, and read it to you. **Same client. Same model. Different tools.** That switchover is the whole point of the Model Context Protocol.

MCP, released by Anthropic in late 2024, is the open standard that finally answers *"how do I give an LLM real-world tools?"* Before MCP, every AI app rolled its own plugin system. After MCP, you write a server once and **every** compatible client speaks to it the same way — Claude Desktop, Cursor, Continue.dev, Zed, custom agents you build with the Anthropic SDK.

Today I'm going to walk you through building one. The whole server is 250 lines. The whole thing.

## The mental model

```
┌─────────────────┐   JSON-RPC 2.0   ┌──────────────────┐   HTTPS   ┌──────────────┐
│ Claude Desktop  │ ◄─── stdio ────► │ your MCP server  │ ◄───────► │  Wikipedia   │
│   (client)      │                  │    (Node.js)     │           │   (REST API) │
└─────────────────┘                  └──────────────────┘           └──────────────┘
```

Three things happen in this triangle:

1. **The client spawns your server** as a child process when the app launches.
2. **They talk JSON-RPC 2.0 over stdio** — the server reads requests from stdin and writes responses to stdout. The wire format is the same one the Language Server Protocol has used since 2016 (yes, the protocol behind every "Go to definition" feature in VS Code).
3. **The model decides when to call tools.** Your server provides the tools, the model picks which to call and with what arguments, the client routes the calls, your server runs them and returns results.

That's the whole protocol.

## Step 1: scaffold

```bash
mkdir mcp-from-zero && cd mcp-from-zero
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node tsx
```

`@modelcontextprotocol/sdk` is the official Anthropic SDK. It does **all** the JSON-RPC framing for you — you write tool handlers, the SDK speaks the wire format.

## Step 2: minimal server with stdio transport

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
  name: 'mcp-from-zero',
  version: '0.1.0'
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('ready on stdio')   // NOTE: stderr, not stdout!
```

That's a fully working MCP server. It does nothing useful yet — no tools — but a client can `initialize` against it and read capabilities. Nine lines.

⚠️ **One trap to avoid:** never log to stdout. The stdio transport **reads JSON-RPC frames off stdout**. Any `console.log` corrupts the wire format and the client drops the connection silently. Use `console.error` (which goes to stderr) for **everything**.

## Step 3: add a tool

```ts
import { z } from 'zod'

server.tool(
  'wiki_search',
  'Search Wikipedia for article titles matching a query.',
  {
    query: z.string().min(1).describe('Search query, e.g. "WebAssembly".'),
    limit: z.number().int().min(1).max(20).default(8)
  },
  async ({ query, limit }) => {
    const hits = await searchWikipedia(query, limit)
    return {
      content: [{ type: 'text', text: hits.map(h => `${h.title} — ${h.url}`).join('\n') }]
    }
  }
)
```

Five interesting things here:

1. **`server.tool(name, description, schema, handler)`** — that's the entire API. The SDK wires up `tools/list` and `tools/call` JSON-RPC handlers automatically.
2. **Zod schema → JSON Schema.** The SDK converts your Zod definitions into JSON Schema so MCP clients get parameter docs + validation for free. The model sees the same schema the client sees — it knows what arguments to send.
3. **The `.describe()` calls matter a LOT.** The model reads them as natural language. Better descriptions = better tool selection. "Search query, e.g. 'WebAssembly'" beats "string."
4. **The handler returns content blocks.** Each block has a `type` (text, image, resource_link) and a payload. The model reads them as part of its context.
5. **Async out of the box.** Tools can hit databases, call APIs, run subprocess — anything. The SDK awaits and serialises the result.

## Step 4: the Wikipedia client

```ts
async function searchWikipedia(query: string, limit: number) {
  const u = new URL('https://en.wikipedia.org/w/api.php')
  u.searchParams.set('action', 'opensearch')
  u.searchParams.set('format', 'json')
  u.searchParams.set('search', query)
  u.searchParams.set('limit', String(limit))
  const resp = await fetch(u.toString(), {
    headers: { 'User-Agent': 'mcp-from-zero/0.1 (contact: you@example.com)' }
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const [, titles, snippets, urls] = await resp.json() as [string, string[], string[], string[]]
  return titles.map((title, i) => ({ title, snippet: snippets[i], url: urls[i] }))
}
```

Wikipedia's REST + Action APIs are free, no key, no account. They ask one thing: send a polite `User-Agent` with a contact URL so they can throttle abusers without blocking polite traffic.

## Step 5: resources

Tools are things the **model** calls. Resources are things the **client** pulls on its own.

```ts
server.resource(
  'wiki-trending',
  'wiki://trending',
  { title: 'Trending Wikipedia articles', mimeType: 'text/plain' },
  async (uri) => ({
    contents: [
      { uri: uri.toString(), mimeType: 'text/plain', text: await getTrendingArticles() }
    ]
  })
)
```

Resources are great for context the client might want to inject **without spending model tokens** on a tool call first — daily reports, glossaries, config files, recent activity. The model only sees them if the client decides to put them in the conversation.

## Step 6: hook it into Claude Desktop

```json
{
  "mcpServers": {
    "mcp-from-zero": {
      "command": "node",
      "args": ["/path/to/mcp-from-zero/dist/index.js"]
    }
  }
}
```

Drop that into Claude Desktop's `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%/Claude/`). Restart the app. Bottom-right tool icon now shows your three tools.

Try: *"Use the wiki_extract tool to summarise the article on entropy."*

Claude picks the tool, sends the request to your server, your server hits Wikipedia, returns the text, Claude reads it, writes a summary. The whole loop happens inside the chat.

## Why MCP matters

If you've been watching the AI-agents wave the last twelve months thinking *"every demo has a different tool API,"* MCP is the answer.

- **One server fits every client.** Build mcp-from-zero once, it works in Claude Desktop, Cursor, Continue.dev, Zed, and any custom agent that imports the Anthropic SDK.
- **One spec across vendors.** Microsoft and OpenAI have both publicly committed to supporting MCP. The major IDE makers shipped it within months.
- **Capability negotiation up front.** Clients tell servers what they support (sampling, completion, logging) before any model call.

This is the USB-C moment for AI integrations. One cable, every device. The reason MCP went from "neat protocol" to "everywhere" in six months is that the **distribution model** finally fits: build once, ship to every chat / IDE / agent simultaneously.

## What this changes for you

Five years ago you'd write a Slack bot. Three years ago you'd write a ChatGPT plugin (deprecated 2024). Last year you'd write a Custom GPT (locked to OpenAI). Today you write an MCP server, push it to npm, and any AI client running on any user's machine can install it.

The code for this demo is on [GitHub](https://github.com/dev48v/mcp-from-zero), with eight step-by-step commits you can follow. Clone it, hook it into Claude Desktop in two minutes, and you've now extended your AI client with a tool you wrote yourself. That's the whole point.

Welcome to MCP.

---

🔗 Code: [github.com/dev48v/mcp-from-zero](https://github.com/dev48v/mcp-from-zero)
📚 Series: [TechFromZero](https://dev48v.infy.uk/techfromzero.php) — a new technology every day, all free, all open source.
