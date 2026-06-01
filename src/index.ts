#!/usr/bin/env node
// STEP 2 — Minimal Model Context Protocol server with stdio transport.
//
// The Model Context Protocol (MCP) is Anthropic's open standard for letting
// an AI client (Claude Desktop, Cursor, custom agent) call tools and read
// resources from external servers. The wire format is JSON-RPC 2.0 over a
// pluggable transport.
//
// stdio is the canonical local-dev transport: the client launches your
// server as a child process, the server reads requests from stdin and
// writes responses to stdout. NOTHING else may go to stdout — log output
// MUST go to stderr (console.error) or the client will treat the noise as
// malformed JSON-RPC and drop the connection.
//
// STEPS 3-5 add three Wikipedia tools. STEP 6 exposes a resource. STEP 7
// hardens errors. STEP 8 ships the README.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
  name: 'mcp-from-zero',
  version: '0.1.0'
})

// STEPS 3-5 register tools here. The McpServer class wires up tools/list and
// tools/call handlers automatically once we call server.tool(...).

async function main() {
  // StdioServerTransport reads JSON-RPC frames from process.stdin and writes
  // them to process.stdout. The protocol uses Content-Length-prefixed
  // newline-delimited JSON, the same wire shape as the Language Server
  // Protocol.
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('mcp-from-zero ready on stdio')
}

main().catch(err => {
  console.error('fatal:', err)
  process.exit(1)
})
