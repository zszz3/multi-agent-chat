# MCP Development Guide

## Scope

`src/mcp/server.ts` exposes a subset of the desktop app as an MCP server.

It is started separately with:

```bash
npm run mcp
```

This module is not the source of truth for app state. It is an adapter over the running desktop app.

## Runtime Model

The MCP server works like this:

1. read the local discovery file for the desktop app bridge
2. discover host, port, and auth token
3. expose MCP tool definitions over stdio
4. translate tool calls into HTTP requests against the local bridge

If the desktop app is not running, MCP requests fail with an explicit error.

## Main Responsibilities

`src/mcp/server.ts` currently owns:

- MCP tool definitions
- JSON-RPC request handling
- bridge discovery path resolution
- authenticated bridge HTTP calls
- response serialization back to the MCP client

## Tool Surface

The current tool categories include:

- skill and agent template listing
- configured agent CRUD
- agent testing
- channel and model listing
- workflow create/list/get/update/validate
- workflow context append
- workflow run context append

The mapping from MCP tool name to bridge route is defined centrally in `TOOL_ROUTES`.

## Design Rules

### MCP Is an Adapter

Do not reimplement business logic here.

If a capability needs richer behavior:

- add or change it in the main-process bridge/backend first
- then map it into an MCP tool here

### Keep Schemas Honest

The `inputSchema` definitions are the MCP contract for callers. If a route changes, update:

- the schema
- the tool description
- the bridge request payload shape

### Failure Mode Should Stay Clear

The current code intentionally distinguishes:

- app not running
- invalid discovery file
- unknown MCP tool
- bridge request failure

Keep these errors explicit. MCP users need actionable failures.

## Bridge Dependency

The MCP server depends on the local bridge started by the desktop app.

That means changes to MCP often also require checking:

- `src/main/mcp-bridge.ts`
- bridge discovery file generation in main process bootstrap
- shared request and response types

## Testing Focus

`src/mcp/server.test.ts` should remain the first line of defense.

Important test targets:

- tool definition stability
- bridge discovery behavior
- payload forwarding
- failure messages when the app is unavailable

## Development Advice

- add capabilities through the backend, not around it
- keep MCP naming aligned with the actual app domain
- avoid hidden payload transforms
- document new tools in both schema and description so external clients understand intent
