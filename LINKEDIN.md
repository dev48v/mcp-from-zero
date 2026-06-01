Day 40 - Today I learned how to give Claude Desktop (or Cursor, or Continue, or any AI client) a tool I wrote myself.


🚀TechFromZero Series - MCPFromZero


🌐 Read the article: https://dev.to/dev48v/i-built-a-custom-tool-server-for-claude-in-250-lines-of-typescript-3nph


This isn't a Hello World. It's a real MCP server that gives any compatible AI client three Wikipedia tools (search, summary, full extract) and one trending-articles resource:
📐 Claude Desktop ↔ JSON-RPC 2.0 over stdio ↔ Node.js MCP server ↔ Wikipedia REST API


🔗 The full code (with step-by-step commits you can follow):
https://github.com/dev48v/mcp-from-zero


🧱 What I built (step by step):
1️⃣ Node 22 + TypeScript scaffold

2️⃣ MCP SDK + stdio transport boilerplate — JSON-RPC 2.0 frames in 9 lines

3️⃣ wiki_search tool with Zod schema → auto-converted to JSON Schema for the tools/list response

4️⃣ wiki_summary tool — fetches intro + thumbnail in one REST call

5️⃣ wiki_extract tool — full plain-text article body with character-budget truncation

6️⃣ wiki://trending resource — top 20 most-viewed Wikipedia articles from yesterday (resources are content the client can pull on its own without paying model tokens)

7️⃣ Error handling — safeTool() wrapper returns { isError: true } so the model can recover instead of getting opaque failures

8️⃣ README with Claude Desktop config snippet — three lines of JSON and the server is live in your AI client


💡 Every file has detailed comments explaining WHY, not just what. Written for any beginner who wants to learn the Model Context Protocol by reading real code — with full clarity on each step.


👉 If you've watched the AI-agents wave the last twelve months thinking "every demo has a different tool API," MCP is the answer. It's the USB-C of AI integrations — one cable that fits Claude Desktop, Cursor, Continue.dev, Zed, and any custom agent. Build one server. Ship to every client.


🔥 This is Day 40 of a 50-day series. A new technology every day. Follow along!


🌐 See all days: https://dev48v.infy.uk/techfromzero.php


#TechFromZero #Day40 #MCP #Anthropic #LearnByDoing #OpenSource #BeginnerGuide #100DaysOfCode
