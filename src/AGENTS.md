# Test WebMCP tools in Chrome

This machine already has Chrome WebMCP testing on (`chrome://flags/#enable-webmcp-testing`). After you register or change a tool, verify it is actually exposed — a render is not enough.

1. Open the local or deployed page in Chrome (not an iframe).
2. In DevTools console:

```js
const ctx = document.modelContext ?? navigator.modelContext;
await ctx.getTools();
```

3. Confirm the new tool appears with the expected `name`, `description`, and `inputSchema`.
4. Call it with `executeTool` or the Model Context Tool Inspector and check the return value plus the UI update.

Use `document.modelContext.registerTool` (feature-detect `document.modelContext ?? navigator.modelContext`). Register in a client component on the top-level document. Unregister with `AbortSignal` only — there is no `unregisterTool()`.

See `docs/webmcp.md` for the API, security hints, and ChatGPT site-tools limits.
