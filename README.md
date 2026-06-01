# MCP From Zero

> A custom Model Context Protocol server that gives any MCP-compatible AI client (Claude Desktop, Cursor, Continue.dev, custom agents) the ability to read Wikipedia.

**Series:** [TechFromZero](https://dev48v.infy.uk/techfromzero.php) — Day 40 of 50.

The Model Context Protocol (MCP), released by Anthropic in late 2024, is the open standard that finally answers "how do I give an LLM real-world tools?" Before MCP, every AI app rolled its own plugin system. After MCP, you write a server once and **every** compatible client speaks to it the same way.

This server exposes three Wikipedia tools and one resource:

| Tool / Resource | What it does |
|-----------------|--------------|
| `wiki_search(query, limit?)` | Returns up to N candidate article titles + URLs for a query. |
| `wiki_summary(title)` | Returns the intro paragraph + metadata for a Wikipedia article. |
| `wiki_extract(title, max_chars?)` | Returns the full plain-text body of an article, truncated to a character budget. |
| `wiki://trending` | Resource: top 20 most-viewed English Wikipedia articles from yesterday. |

No API key. No account. Free Wikipedia REST + Action API endpoints + the [Wikimedia pageviews](https://wikimedia.org/api/rest_v1/) service.

## Quick start

```bash
git clone https://github.com/dev48v/mcp-from-zero.git
cd mcp-from-zero
npm install
npm run build
```

## Hook it into Claude Desktop

Open Claude Desktop's settings file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this server entry (adjust the path to where you cloned the repo):

```json
{
  "mcpServers": {
    "mcp-from-zero": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-from-zero\\dist\\index.js"]
    }
  }
}
```

Restart Claude Desktop. The bottom-right tool icon should now show three new tools. Try asking:

> "What's on the Wikipedia article about WebAssembly? Use the wiki_extract tool."

Claude will pick `wiki_extract`, call the server, and summarise the returned text.

## Hook it into Cursor / Continue.dev / Zed

Same JSON shape — every major MCP client accepts an `mcpServers` map. The protocol is the same regardless of who's on the other side.

## How it works

```
Claude Desktop  ←─ JSON-RPC 2.0 over stdio ─→  this server  ←─ HTTPS ─→  Wikipedia
   (client)                                    (Node.js)                 (REST API)
```

1. The client launches the server as a **child process** when you open the app.
2. The client sends an `initialize` JSON-RPC request on stdin. The server replies with its capabilities (tools, resources, prompts).
3. The client lists tools (`tools/list`). The user types a question. The AI decides to call a tool. The client sends `tools/call`. The server runs the handler, hits Wikipedia, and returns the result.
4. The result lands in the conversation. The AI sees it as part of its context. The model writes a reply.

That's the whole protocol. Same shape as the Language Server Protocol (Microsoft, 2016), just for AI tools instead of IDE features.

## Step-by-step commits

Each commit on `main` adds one concept:

| Step | What lands |
|------|-----------|
| 1 | Node 22 + TypeScript scaffold |
| 2 | MCP SDK + stdio transport boilerplate |
| 3 | `wiki_search` tool via the opensearch API |
| 4 | `wiki_summary` tool via the REST summary endpoint |
| 5 | `wiki_extract` tool via the Action API extracts prop |
| 6 | `wiki://trending` resource (Wikimedia pageviews) |
| 7 | Error handling + `structuredContent` on every tool |
| 8 | README + Claude Desktop config snippet |

## Why MCP matters

If you've watched the "AI agents" wave the last twelve months and thought *"every demo has a different tool API,"* MCP is the answer. It's the **first** standard that lets:

- One server work with every client (Claude Desktop, Cursor, Continue, Zed, custom agents).
- Tools, resources, and prompts have a single wire format across vendors.
- Capability negotiation (clients can ask "do you support sampling? completion? logging?") happen up-front before any model call.

Anthropic open-sourced the spec under MIT and shipped reference SDKs in TypeScript, Python, Java, Kotlin, and C#. Microsoft, OpenAI, and the rest of the major model providers have committed to supporting it. **This is the USB-C of AI integrations** — one cable that fits every plug.

If you build one server, you ship to every client. That's why MCP went from "neat protocol" to "everywhere" in six months.

## File map

```
src/
  index.ts          ← MCP server: McpServer + three tools + one resource
  wiki.ts           ← Wikipedia REST client (search, summary, extract, trending)
```

## License

MIT. Use it, fork it, teach with it.
