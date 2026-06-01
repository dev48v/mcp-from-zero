// STEP 1 — Entry point.
//
// The whole server is fewer than ~250 lines by the end of STEP 8. We split
// it into one main file (this) plus a thin `wiki.ts` module so the MCP
// boilerplate is clearly separated from the Wikipedia REST client.
//
// STEPS 2-7 add the MCP server, three tools, a resource, and error handling.
// For now this just prints a banner so `node dist/index.js` and `tsx
// src/index.ts` both produce visible output.
console.error('mcp-from-zero booting — STEPS 2-7 add real server, STEP 8 ships.')
