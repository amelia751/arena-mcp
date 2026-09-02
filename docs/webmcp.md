# WebMCP

Research notes on the Web Model Context Protocol: what it is, the full API surface, the security
model, the current browser/agent support picture, and the tooling ecosystem around it.

Researched September 1, 2026. WebMCP is a moving target — every section below cites its source so
you can re-check anything that looks stale.

---

## Table of contents

1. [What WebMCP is](#1-what-webmcp-is)
2. [Standards and shipping status](#2-standards-and-shipping-status)
3. [Mental model: WebMCP vs. MCP vs. DOM actuation](#3-mental-model-webmcp-vs-mcp-vs-dom-actuation)
4. [The Imperative API](#4-the-imperative-api)
5. [Discovery and in-page agents](#5-discovery-and-in-page-agents)
6. [The Declarative API](#6-the-declarative-api)
7. [Origins, iframes, and permissions policy](#7-origins-iframes-and-permissions-policy)
8. [Security model](#8-security-model)
9. [Tool design best practices](#9-tool-design-best-practices)
10. [Browser and agent support](#10-browser-and-agent-support)
11. [Libraries and framework support](#11-libraries-and-framework-support)
12. [Testing, debugging, and tooling](#12-testing-debugging-and-tooling)
13. [Enabling it in production](#13-enabling-it-in-production)
14. [Applying this to a Next.js App Router codebase](#14-applying-this-to-a-nextjs-app-router-codebase)
15. [Gotchas](#15-gotchas)
16. [Sources](#16-sources)

---

## 1. What WebMCP is

WebMCP is a JavaScript interface that lets a web page expose its own functionality to AI agents as
**tools** — functions with a natural-language description and a JSON Schema, registered on
`document.modelContext`.

The spec's own framing: a page using WebMCP "can be thought of as [a] Model Context Protocol server
that implements tools in client-side script instead of on the backend." Tools run inside the page,
in the user's already-authenticated session, reusing the application logic that the human UI
already calls.

The inversion this creates is the whole point. Today an agent has to *infer* what your site can do
by reading the DOM or looking at screenshots. With WebMCP your site *declares* what it can do, and
the agent calls a contract instead of guessing at a button.

Three things the standard provides:

- **Discovery** — a standard way for a page to advertise tools like `checkout` or `filter_results`.
- **Schemas** — explicit JSON Schema input definitions, which cut hallucinated arguments.
- **Shared state** — the human and the agent operate on the same live page, so both see the result.

A minimal tool:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog by keyword.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term" },
    },
    required: ["query"],
  },
  annotations: { readOnlyHint: true },
  execute: async ({ query }) => {
    const results = await searchCatalog(query);
    return JSON.stringify(results);
  },
});
```

---

## 2. Standards and shipping status

WebMCP is a **Draft Community Group Report** from the W3C Web Machine Learning Community Group. It
is explicitly *not* a W3C Standard and *not* on the W3C Standards Track. Editors are Brandon
Walderman (Microsoft), Khushal Sagar (Google), and Dominic Farolino (Google).

Timeline of the pieces that matter:

| Date | Event |
| --- | --- |
| Feb 10, 2026 | First Draft Community Group Report published; Chrome early preview |
| Chrome 146 | DevTrial (flag only, Canary) |
| May 27, 2026 | Spec moves the getter from `Navigator` to `Document` |
| Jun 2, 2026 (Chrome 149) | Origin trial opens |
| Chrome 150 | `navigator.modelContext` deprecated in favor of `document.modelContext` |
| Jul 21, 2026 | Current draft revision |
| Aug 25, 2026 | OpenAI ships "site tools" in the ChatGPT desktop app's built-in browser |
| Chrome 153 | Tool unregistration no longer cancels in-flight executions |
| Chrome 156 / Nov 17, 2026 | Origin trial ends (whichever comes first) |
| Chrome 157 (est. Nov 3, 2026) | Anticipated ship milestone — a target, not a commitment |

Microsoft Edge runs its own parallel origin trial, also expiring November 17, 2026.

**The rename is the single most important compatibility detail.** `navigator.modelContext` still
works as a deprecated alias, which is exactly why the change is easy to miss — your old code keeps
running while logging a deprecation warning on every page load. Also removed along the way:
`unregisterTool()`, `provideContext()`, and `clearContext()`.

Feature-detect across both:

```js
const modelContext = document.modelContext ?? navigator.modelContext;
if (modelContext && "registerTool" in modelContext) {
  // register tools
}
```

---

## 3. Mental model: WebMCP vs. MCP vs. DOM actuation

| | WebMCP | Server MCP | DOM actuation |
| --- | --- | --- | --- |
| Where code runs | In the page, client-side | On a server (Node, Python, …) | Agent drives the UI |
| Needs the page open | Yes | No | Yes |
| Auth | The user's existing session | Separate credentials/OAuth | The user's session |
| Setup for the user | None — just visit the site | Install/connect a server | None |
| Reliability | Contract-based | Contract-based | Guessy, layout-fragile |
| Best for | Human + agent on the same screen | Headless, autonomous work | Sites with no tool support |

The three are complementary, not competing. OpenAI's guidance is explicit that a website can
support both WebMCP and a server MCP: use MCP when the capability should work with no page open
(searching a service, managing records over an API), and WebMCP when the human and agent need to
*see the same thing* — editing a canvas, exploring a dashboard, revising an itinerary next to a map.

Chrome's docs also flag the honest limitation: WebMCP "is primarily designed for local browser
workflows with a human in the loop," and clients only learn a site has tools by visiting it. There
is no global registry.

---

## 4. The Imperative API

### 4.1 The `ModelContext` interface

`document.modelContext` returns a `ModelContext`, which is `SecureContext`-gated (HTTPS or
`file:`). Three methods and one event handler:

```webidl
[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool,
                                  optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString?> executeTool(RegisteredTool tool, optional DOMString inputArguments = "",
                                  optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
};
```

### 4.2 `registerTool(tool, options)`

The tool definition:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `DOMString` | Yes | 1–128 chars, ASCII alphanumeric plus `_`, `-`, `.` only. Unique per document. |
| `title` | `USVString` | No | Human-readable label for browser UI. Should be localized. |
| `description` | `DOMString` | Yes | Natural-language purpose. Must be non-empty. |
| `inputSchema` | `object` | No | JSON Schema. Stored as a stringified deep copy. |
| `execute` | callback | Yes | `(input, { signal }) => result \| Promise<result>` |
| `annotations` | `ToolAnnotations` | No | `readOnlyHint`, `untrustedContentHint` — both default `false`. |

Registration options:

| Option | Purpose |
| --- | --- |
| `signal` | An `AbortSignal` that unregisters the tool when aborted |
| `exposedTo` | Array of secure origins allowed to see and call this tool |

The promise rejects if a tool with the same `name` already exists (`InvalidStateError`), if `name`
or `description` is empty, if `name` violates the charset/length rule, if `inputSchema` fails
`JSON.stringify` (circular refs, a `toJSON` returning `undefined`), if the document isn't
origin-keyed (`SecurityError`), if the `tools` permission policy blocks it (`NotAllowedError`), or
if the document isn't fully active (`InvalidStateError`).

### 4.3 Unregistering

There is no `unregisterTool()`. The only mechanism is an `AbortSignal` passed at registration:

```js
const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: "add_todo",
    description: "Add a new item to the to-do list.",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async ({ text }) => `Added to-do: ${text}`,
  },
  { signal: controller.signal }
);

controller.abort(); // tool is gone
```

As of Chrome 153, aborting the registration signal no longer cancels in-flight executions of that
tool. Before 153, unmounting a component mid-call could kill the call — which mattered a lot for
React/Angular integrations that tie registration to component lifecycle.

### 4.4 Cancellation inside `execute`

`execute` receives a second argument carrying an `AbortSignal` that fires when the user or agent
cancels the call. Thread it through anything long-running:

```js
await document.modelContext.registerTool({
  name: "fetch_url",
  description: "Fetch the text content of a URL and stream the response.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch" },
      priority: { type: "string", enum: ["high", "low", "auto"] },
    },
    required: ["url"],
  },
  execute: async ({ url, priority }, { signal }) => {
    const response = await fetch(url, { priority, signal });
    const stream = response.body.pipeThrough(new TextDecoderStream());
    for await (const chunk of stream) {
      document.querySelector("pre").textContent += chunk;
    }
    return "Success";
  },
});
```

### 4.5 Return values

The spec resolves `executeTool()` with "the stringified result of the tool's execution," so the
practical contract is: return something that stringifies into text the model can read. Three shapes
appear across the official docs and demos:

```js
// Plain string — simplest, used throughout Chrome's docs
return `Performed ${action} on layer: ${layer}`;

// Plain object — used in OpenAI's example
return { title: document.title };

// MCP content envelope — mirrors server-side MCP
return { content: [{ type: "text", text: JSON.stringify(results) }] };
```

Chrome's guidance is to pick "the format that best serves your specific use case, optimized for the
LLM to process." Note that `outputSchema` is **not** part of the native API — Chrome neither defines
nor enforces it. The MCP-B React hooks accept it for their own output typing, which is a
library-level extension, not a platform feature.

---

## 5. Discovery and in-page agents

`getTools()` and `executeTool()` exist for **in-page agents** — a chat widget you ship in your own
JavaScript. The browser's own agent uses a separate internal mechanism (see §5.3).

```js
const [tool] = await document.modelContext.getTools();
console.log(tool);
// {
//   annotations: { readOnlyHint: false, untrustedContentHint: true },
//   description: "Add a new item to the to-do list",
//   inputSchema: {"type":"object","properties":{…}},
//   name: "add_todo",
//   origin: "https://example.com",
//   title: "",
//   window: Window {…},
// }
```

Results are alphabetically ordered and scoped to what the calling document is authorized to see.

### 5.1 Executing

`executeTool()` takes input arguments as a **JSON string**, not an object:

```js
const result = await document.modelContext.executeTool(tool, '{"text": "Buy milk"}');
// 'Added to-do: Buy milk'
```

It resolves to `null` when the tool triggers a navigation. Pass a `signal` to cancel:

```js
const controller = new AbortController();
document.modelContext.executeTool(tool, '{"text": "Buy milk"}', { signal: controller.signal });
controller.abort();
```

The two MCP-B runtime packages expose a descriptor-based `executeTool()` that also accepts
serialized JSON, but the signatures have drifted from the proposal — feature-detect rather than
assume.

### 5.2 `toolchange`

```js
document.modelContext.addEventListener("toolchange", () => {
  // The set of available tools changed.
});
```

The spec is emphatic that this event's ordering relative to other task sources is **not
reliable**. `toolchange` fires on the WebMCP task source, parent before child frames, and the
`registerTool()` promise always resolves after both — but an unrelated `setTimeout` queued around
the same time can land before, between, or after all three. Don't build sequencing logic on it.

Two more events are specified but still marked TODO in the draft: `toolactivated` and
`toolcanceled` (Issue #146). The declarative API already fires window-level `toolactivated` and
`toolcancel` events today.

### 5.3 How the browser's agent actually sees your tools

Worth understanding because it explains a class of surprising behavior. The browser's agent does
not run JavaScript in your page. It builds an **observation** — an implementation-defined snapshot
containing at minimum a tool map, and usually much more: DOM serialization, screenshots, whatever
the user agent thinks is relevant. Chromium's Annotated Page Content is the reference example.

So the agent sees your tools *and* your page. If your tool succeeds but the UI doesn't update, the
agent's next observation contradicts your return value — which is exactly why Chrome's best
practices tell you to update the interface before returning.

---

## 6. The Declarative API

Annotate an HTML `<form>` and the browser synthesizes a tool from it. No JavaScript required.

```html
<form toolname="supportRequestTool"
      tooldescription="Submit a request for support."
      action="/submit">
  <label for="firstName">First Name</label>
  <input type="text" name="firstName" id="firstName">

  <label for="lastName">Last Name</label>
  <input type="text" name="lastName" id="lastName">

  <select name="select" required
          toolparamdescription="Determines what team this request is routed to.">
    <option value="Customer happiness team">Return my purchase.</option>
    <option value="Distribution team">Check where my package is.</option>
    <option value="Website support team">Get help on the website.</option>
  </select>

  <button type="submit">Submit</button>
</form>
```

Attributes:

| Attribute | On | Effect |
| --- | --- | --- |
| `toolname` | `<form>` | Tool name. Removing it unregisters the tool. |
| `tooldescription` | `<form>` | Tool description. Removing it unregisters the tool. |
| `toolparamdescription` | Form controls | Property description in the schema. Falls back to the `<label>`, then `aria-description`. |
| `toolautosubmit` | `<form>` | Submits (and navigates) when the agent invokes the tool. |

The browser derives a JSON Schema from the field names, types, `required` attributes, and
`<option>` values — `<select>` becomes an `anyOf` of `const`/`title` pairs plus a flat `enum`.

Without `toolautosubmit`, the browser focuses the form and fills it, then the **human** clicks
submit. That's a genuinely nice default: the agent does the tedious mapping, the person keeps the
final say.

### 6.1 Agent-aware submission

`SubmitEvent` gains two members:

- `agentInvoked` — `true` when an agent triggered the submission.
- `respondWith(promise)` — resolve it to return a value to the model. Requires `preventDefault()`
  first.

```html
<form toolautosubmit toolname="search_tool" tooldescription="Search the web" action="/search">
  <input type="text" name="query">
</form>
<script>
  document.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!myFormIsValid()) {
      if (e.agentInvoked) e.respondWith(myFormValidationErrorPromise);
      return;
    }
    if (e.agentInvoked) e.respondWith(Promise.resolve("Search is done!"));
  });
</script>
```

### 6.2 Lifecycle events and focus styling

```js
window.addEventListener("toolactivated", ({ toolName }) => { /* fields were pre-filled */ });
window.addEventListener("toolcancel", ({ toolName }) => { /* user cancelled or reset */ });
```

Two CSS pseudo-classes give the user a visible signal that an agent is driving the form:

```css
form:tool-form-active {
  outline: light-dark(blue, cyan) dashed 1px;
  outline-offset: -1px;
}

input:tool-submit-active {
  outline: light-dark(red, pink) dashed 1px;
  outline-offset: -1px;
}
```

### 6.3 Caveat

The declarative API's normative spec text is **still a TODO** — §4.3 of the draft literally says
"This section is entirely a TODO," and the algorithm for synthesizing a JSON Schema from a form is
unwritten. It works in Chrome behind the origin trial, but **ChatGPT's built-in browser does not
support it at all**. If you need coverage across today's agents, use the imperative API.

---

## 7. Origins, iframes, and permissions policy

Three independent gates.

**Origin isolation.** WebMCP only works in origin-isolated documents, so that the origin stays
stable for the tool's lifetime. If `document.domain` is enabled (e.g. via
`Origin-Agent-Cluster: ?0`), the API is disabled outright.

**Permissions policy.** Both APIs are gated behind the `tools` policy-controlled feature, default
allowlist `'self'`. That permits top-level and same-origin registration, and blocks cross-origin
iframes. To delegate:

```html
<iframe src="https://example.com" allow="tools"></iframe>
```

**Origin exposure.** Even with the policy granted, tools are invisible cross-origin by default.
`exposedTo` opts specific secure origins in:

```js
// https://partner.org
await document.modelContext.registerTool(
  { name: "my_shared_tool", description: "Shared across origins", /* … */ },
  { exposedTo: ["https://example.com"] }
);
```

And the consumer must *also* ask for them explicitly:

```js
// https://example.com
const sameOrigin = await document.modelContext.getTools();
const withPartner = await document.modelContext.getTools({
  fromOrigins: ["https://partner.org"],
});
```

Both arrays reject non-secure origins with a `SecurityError`. Exposure is bidirectional — it covers
both "partner embedded in your site" and "your site embedded in partner."

Note that **ChatGPT's built-in browser doesn't discover tools in iframes at all**, same-origin or
cross-origin. Register in the top-level document.

---

## 8. Security model

Chrome published two separate guides — one for tool authors, one for agent authors — and the spec
carries its own threat analysis. The short version: LLMs treat instructions and data as one token
stream, so indirect prompt injection is a structural problem that cannot be fully solved inside the
model.

### 8.1 The threat classes

**Tool poisoning (metadata attacks).** Hidden instructions in tool names, parameter names, or
descriptions, designed to hijack an agent that reads them. The spec's proposed mitigation is
maximum input lengths — the 128-char `name` cap already exists; limits on titles and descriptions
are open (Issue #73).

**Output injection.** A tool returns content containing malicious instructions. This bites *trusted*
tools too, any time they surface third-party content: reviews, comments, forum posts, anything
user-supplied.

**Privacy leakage through over-parameterization.** The most interesting one, and it's a design
problem, not a bug. Agents are helpful, so a site can ask for parameters the user never chose to
share, and the agent will supply them from personalization context. The spec's own example is a
`search-dresses` tool whose schema quietly asks for `age`, `pregnant`, `location`, `height`,
`skinTone` — each with a plausible-sounding description like "For maternity options." Every
parameter gets logged. The spec names the consequences directly: silent profiling, cross-site
tracking (an agent learns your location from a weather site and hands it to a shopping site), and
price/service discrimination.

**Same-origin boundary violations** and **private browsing leakage** are flagged in the draft but
still TODO.

### 8.2 What tool authors should do

- **`untrustedContentHint: true`** on any tool returning user-generated or externally sourced
  content. It labels the payload as untrusted so the agent applies heightened scrutiny.
- **`readOnlyHint: true`** on tools that don't mutate state, so the agent knows when it can skip a
  confirmation prompt.
- **`exposedTo` only origins you actually trust.** Chrome's framing is useful: you might expose
  `postComment` to `trustedExample.com` but never to `evilExample.com`. And read-only isn't
  automatically safe — `getFavoriteProducts` leaks user data, so only expose it to sites you'd hand
  that data to directly.
- **Reuse your existing authorization.** A WebMCP tool is another caller of your app logic. Same
  authn, authz, and input validation as the human path.

### 8.3 Character budgets

Chrome's recommended limits, to stay inside agent guardrails:

| Item | Limit |
| --- | --- |
| Tool description | 500 characters |
| Parameter description | 150 characters |
| Tool name / parameter name | 30 characters |
| Individual tool output | 1,500 characters |

These are recommendations that vary by agent, and may become normative later.

### 8.4 What agent authors should do

From Chrome's agent-side guidance: set token limits, honor `untrustedContentHint` in system
instructions, restrict cross-origin interactions, and confirm consequential actions with the user.
Use **spotlighting** — demarcate untrusted content and instruct the model to treat it as data, not
instructions. Consider prompt-injection classifiers (Chrome names Google Cloud's Model Armor) and
secondary "critic" models that review planned tool calls before execution.

### 8.5 How ChatGPT handles it

OpenAI's stance is worth quoting because it's the one implementation shipping on by default:
"Website-provided tool definitions and results are untrusted content. A tool's name or claim that it
only reads data isn't proof of what it does."

In practice: every invocation gets a safety review before it runs; normal website-access and
confirmation policies still apply for consequential actions (sending messages, purchases, deletions,
permission changes); each invocation is tied to its originating page and tool registration; and the
user can turn the whole thing off under Settings → Browser → Permissions.

### 8.6 Still open

`requestUserInteraction()` — asynchronously requesting user input mid-execution — is in the spec
draft, and cross-party consent management is under active discussion. Neither is settled.

---

## 9. Tool design best practices

Condensed from Chrome's best-practices guide, which is the most useful document in the set.

**One tool, one function.** Overlapping tools confuse the agent's selection. Every tool also
consumes context window and adds latency, so more is not better. Distinguish execution from
initiation in the name: `create-event` creates immediately; `start-event-creation-process` redirects
to a form.

**Register statically unless you have a reason not to.** Dynamic registration by route or state is
supported, but static is the recommended default.

**Trust the agent.** Write positive, descriptive instructions, not rigid step lists or negative
constraints. Chrome's example of what not to write is `"Don't use this tool for weather."` — the
limitation should be implicit in a good description: `"This tool can create a calendar event,
scheduled for a specific date and time."`

**Minimize cognitive computing.** Accept raw user input rather than asking the model to transform
it — if the user says "11:00 to 15:00," take the string; don't make the model compute the interval.
Declare concrete types and enums. Explain *why* a choice exists, and prefer natural language over
opaque IDs: `shipping="Express"`, not `shipping_id=1`.

**Prioritize reliability.** Fail gracefully on rate limits with a meaningful error. Update the UI
before returning, since the agent reads the interface to plan its next step. Validate strictly in
code and loosely in schema — schema constraints aren't guaranteed, so return descriptive errors that
let the model self-correct and retry.

**Test with evals, not unit tests.** Outputs are non-deterministic. Define the problem as an API
contract, establish a baseline and an ideal result, and decide how you'll grade — code-based checks
for rule-based outputs, LLM-as-a-judge for the rest. Resist patching model-specific quirks with
narrow rules; abstract the tool instead. Chrome's example: if a model keeps picking the wrong
honorific, make the field optional and let the agent ask the user, rather than adding a rule.

---

## 10. Browser and agent support

Status as of late August 2026, per the WebMCP ecosystem tracker (verified Aug 26, 2026) plus vendor
docs.

### Browsers

| Browser | Status | Notes |
| --- | --- | --- |
| Chrome | Origin trial | Chrome 149–156; targeting 157. Local flag: `chrome://flags/#enable-webmcp-testing` |
| Edge | Origin trial | Separate registration, open through Nov 17, 2026 |
| Brave | Behind a flag | Nightly, desktop + Android. `brave://flags/#enable-webmcp-testing` |
| Lightpanda | Partial | Headless engine for agents; still on `navigator`, so spec-compliant pages are invisible to it |
| Firefox | No support | Mozilla position: **neutral**. Concerns: sites passing agents instructions a human can't see, and data collection through tool inputs |
| Safari | No support | WebKit position: **opposed**. Argues an agent acting for a user is closer to assistive technology, and sites shouldn't be able to detect and treat it differently |

The Safari position is the most consequential thing on this table. It's not a "not yet" — it's a
structural objection, with a request to reconsider the proposal in a new working group.

### Agents

| Agent | Status | Notes |
| --- | --- | --- |
| ChatGPT desktop app | **Works today, on by default** | "Site tools." Both Work and Codex chats. GPT-5.6 Sol or Terra only — Luna has WebMCP disabled. Not available in Enterprise or Edu workspaces |
| Brave Leo | Behind a flag | Nightly only; publicly demoed Aug 19, 2026 |
| Codex Chrome extension | Behind a flag | Requires full CDP access under Settings → Browser → Developer mode; OpenAI flags it as elevated risk |
| Gemini in Chrome | Not usable | No published statement that it consumes WebMCP tools. Chrome's own inspector extension is explicitly separate from Gemini in Chrome |
| Claude for Chrome | No support | Reads page text, DOM, console, network, screenshots — not registered tools. Covers Claude Code, Cowork, and Claude Desktop, which all browse through this extension |
| ChatGPT Work cloud browser | No signal | Public pages only; no credentials, autofill, or sign-in |
| Perplexity Comet | No signal | Accessibility tree and screenshots |

The practical read: **ChatGPT's built-in browser is the only mainstream agent where WebMCP works
without the user flipping a flag.** Everything else is experimental, flagged, or absent.

ChatGPT's implementation supports a subset of the spec — no declarative API, no iframe tools.

---

## 11. Libraries and framework support

### Types

- **`webmcp-types`** (Community Group, v0.1.5) — zero-dependency `.d.ts` tracking the live spec.
  ~19k weekly downloads. Add `"types": ["webmcp-types"]` to `tsconfig.json`, or use
  `/// <reference types="webmcp-types" />` if your toolchain skips `tsconfig`.
- **`@mcp-b/webmcp-types`** — MCP-B's contracts, schema inference, `Document` augmentation, and
  deprecated `Navigator` compatibility.

### Runtime (MCP-B)

The `@mcp-b/*` family is maintained by the MCP-B project and layers on top of the standard:

| Package | Purpose |
| --- | --- |
| `@mcp-b/webmcp-polyfill` | Tool registration and discovery where native support is missing. ~45k downloads/week |
| `@mcp-b/global` | Full runtime — transports, `BrowserMcpServer`, extension APIs, prompts, resources |
| `@mcp-b/webmcp-ts-sdk` | Browser-adapted MCP TypeScript SDK with dynamic registration |
| `@mcp-b/transports` | Tab, iframe, and extension transports for moving MCP messages across browser boundaries |
| `@mcp-b/mcp-iframe` | Custom element exposing an iframe's tools/prompts/resources to its parent |
| `@mcp-b/webmcp-extension` | Chromium MV3 template + isolated-world client for calling page tools from an extension |
| `@mcp-b/webmcp-local-relay` | Local relay connecting browser-hosted tools to desktop MCP clients over stdio/WebSocket |
| `@mcp-b/smart-dom-reader` | Token-efficient DOM extraction and selector generation |

The polyfill is **dropping the `navigator` alias in its next major release**, so migrate to
`document.modelContext` before upgrading.

MCP-B's own decision ladder: use native if the browser has what you need → `webmcp-types` for
ambient types → `@mcp-b/webmcp-types` for inference → `@mcp-b/webmcp-polyfill` for compatibility →
`@mcp-b/global` only if you need transports, prompts, resources, or direct server access.

### React

Two hooks packages, same `useWebMCP` implementation:

- **`usewebmcp`** (v5.1.0, MIT) — strict-core, tool registration only. Use this unless you need
  more.
- **`@mcp-b/react-webmcp`** — adds `useWebMCPPrompt`, `useWebMCPResource`, and
  `McpClientProvider`/`useMcpClient`. Prompt and resource hooks require `@mcp-b/global`. React 17,
  18, or 19.

```tsx
import { useWebMCP } from "usewebmcp";

const { state, execute, reset } = useWebMCP({
  name: "add_to_cart",
  description: "Add a product to the shopping cart.",
  inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  execute: async ({ sku }) => addToCart(sku),
});
// state: { isExecuting, lastResult, error, executionCount }
```

Both hooks register after React commits and abort on unmount, so you never manage an
`AbortController` yourself. Pass `enabled: false` to keep a tool unregistered — call the hook
unconditionally and put the condition in `enabled`. `reset()` clears observed state but does not
cancel running work. `document.modelContext` must exist before the hook mounts (native, polyfill,
or `@mcp-b/global`).

### Angular

Angular has experimental first-party support, and its forms integration is the most interesting
framework work in the ecosystem — it tries to generate *better* tools than the web standard can,
using the framework's own knowledge of the data model.

```ts
// bootstrap
bootstrapApplication(AppRoot, { providers: [provideExperimentalWebMcpForms()] });

// component
readonly userForm = form(
  this.model, // signal({ firstName: '', lastName: '', age: 0, hobbies: ['Web Development'] })
  (f) => {
    required(f.firstName, { message: "First name is mandatory." });
    required(f.lastName, { message: "Last name is mandatory." });
  },
  {
    experimentalWebMcpTool: { name: "registerUser", description: "Registers a new user." },
    submission: { action: async (formValue) => { /* … */ } },
  }
);
```

Angular infers the JSON Schema from the model's initial values and wires the form's validators into
the tool call, so the agent sees field errors and self-corrects instead of submitting garbage.
Three constraints follow from schema-by-inference: initial values must be concrete (`''`, `0`,
`false` — never `null`/`undefined`), arrays need at least one element so the item shape is known,
and async validators don't run during agent submission. Angular does not verify that agent input
matches the inferred schema, so keep validating inside `submission`.

There's also `provideExperimentalWebMcpTools` for imperative tools bound to the DI lifecycle.

### Agent-side frameworks

| Framework | Status |
| --- | --- |
| Stagehand (Browserbase) | **Works today**, TypeScript only. `page.listWebMCPTools()` / `page.invokeWebMCPTool()`. Its autonomous agent can't see the tools — you call the API from your own code. Local browsers only; no route on Browserbase's rented sessions |
| Chrome DevTools MCP | Behind a flag — `--categoryExperimentalWebmcp` plus matching Chrome flags. This is how Claude Code and Cursor can reach page tools |
| Puppeteer | Behind a flag, Chrome 151+. Pass `--enable-features=WebMCP` yourself. DevTools MCP builds on this layer |
| Cloudflare Browser Run | Behind a flag, `--lab` test pool only, reads the older API |
| Playwright / Playwright MCP | **No support.** Request closed as not planned in April 2026 — "let's see if it gains any adoption first." At ~78M downloads/week with many agent frameworks on top, this is the biggest gap in the ecosystem |
| browser-use | No support. A thorough PR was closed unmerged by an inactivity bot in April 2026 |
| Firecrawl | No product support; a blog post documents a manual workaround via their cloud browser |

---

## 12. Testing, debugging, and tooling

**Local flag.** `chrome://flags/#enable-webmcp-testing` → Enabled → relaunch. No origin trial token
needed for local development.

**DevTools console.** The fastest sanity check:

```js
await document.modelContext.getTools();
```

If that returns `[]` on a page you instrumented, the problem is registration, not the agent.

**Model Context Tool Inspector extension** (Google). The main development tool. It lists registered
tools, calls them manually, validates your JSON Schema against what the browser parsed, shows
structured output and errors, and gives you a natural-language chat to check whether an agent
actually picks the right tool. Prompts go to `gemini-3-flash-preview` by default. It's separate from
Gemini in Chrome.

**Demos to read.** Chrome ships three: WebMCP zaMaker (imperative), a React travel demo
(imperative), and Le Petit Bistro (declarative). There's also a Page Agent demo showing how to pull
tools out of an iframe and run them from an in-page chat UI.

**Web Platform Tests.** Cross-browser conformance results at `wpt.fyi/results/webmcp`.

**ChatGPT desktop app.** Open your deployed page in the built-in browser and check the **Site
tools** entry in the address bar. "Available site tools" lists what the page registered; "Recently
used" opens Sources to review actual calls.

---

## 13. Enabling it in production

Until Chrome ships the feature, real users need an origin trial token.

1. Register your domain for the Chrome origin trial (and Edge's separately, if you care about Edge).
2. Add the token via meta tag or HTTP header:

```html
<meta http-equiv="origin-trial" content="YOUR_TOKEN_HERE">
```

```
Origin-Trial: YOUR_TOKEN_HERE
```

3. Serve over HTTPS — `SecureContext` is required.
4. Don't send `Origin-Agent-Cluster: ?0`; it disables the API.

Tokens expire November 17, 2026, or when Chrome 156 ships, whichever comes first. Chrome emails
renewal reminders.

ChatGPT's built-in browser does **not** require an origin trial token — it implements site tools
natively.

---

## 14. Applying this to a Next.js App Router codebase

This repo is Next.js 16 / React 19 with the App Router (`src/app`), so the mechanics are:

**Register from a client component.** `document` doesn't exist during SSR. Put registration in a
`"use client"` component mounted in the layout or on the relevant route.

**Tie registration to the route.** Because there's no `unregisterTool()`, use an effect cleanup that
aborts the signal — this is exactly the shape `usewebmcp` gives you for free:

```jsx
"use client";

import { useEffect } from "react";

export function CatTools({ cats }) {
  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext?.registerTool) return;

    const controller = new AbortController();

    modelContext.registerTool(
      {
        name: "list_cats",
        description: "List the cats currently at the cafe, with name, age, and breed.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => JSON.stringify(cats),
      },
      { signal: controller.signal }
    );

    return () => controller.abort();
  }, [cats]);

  return null;
}
```

**Watch the double-register in dev.** React Strict Mode runs effects twice in development. The
second `registerTool` with the same name rejects with `InvalidStateError`. The cleanup ordering
usually saves you, but handle the rejection so it doesn't surface as an unhandled promise.

**Call the same routes the UI calls.** This app server-renders and keeps its logic in route
handlers under `src/app/api`, so `execute` is a `fetch` to the endpoint the human interface already
posts to. That is the point of WebMCP rather than a parallel agent API: one code path, one set of
checks, and no privileged route that only an agent can reach.

**Thread the execute signal.** `execute` receives `(input, { signal })`. Anything that waits —
polling for a turn, running playouts — should hand that signal to `fetch` so a cancelled call stops
costing something.

**Repaint before returning.** The agent's next observation includes the page, so a tool that writes
should let the route re-render before it answers, or its return value and the visible board
disagree.

**Register in the top-level document.** ChatGPT's browser ignores iframe tools entirely.

---

## 15. Gotchas

- **`navigator.modelContext` is deprecated** but still functional, so nothing breaks loudly. Migrate
  to `document.modelContext` and feature-detect both.
- **No `unregisterTool()`.** `AbortSignal` is the only path.
- **Duplicate names reject.** Re-registering the same name without aborting first throws
  `InvalidStateError`.
- **Unregister-then-quickly-reregister is racy.** The spec documents that an in-flight call can hit
  the new tool's schema with the old tool's arguments (Issue #92 is open).
- **`executeTool()` takes a JSON string**, not an object. It resolves to `null` on navigation.
- **`toolchange` ordering is explicitly unreliable.** Don't sequence on it.
- **`outputSchema` isn't real.** Native Chrome neither defines nor enforces it; it's an MCP-B
  library extension.
- **The declarative spec is unwritten** (§4.3 is a TODO) and unsupported in ChatGPT's browser.
- **Iframe tools are invisible to ChatGPT's browser**, same-origin included.
- **Origin isolation is mandatory.** `Origin-Agent-Cluster: ?0` silently disables everything.
- **Every tool costs context.** More tools with overlapping purposes make selection *worse*, not
  better.
- **Update the UI before you return.** The agent reads the page to plan its next step, and a stale
  interface contradicts your return value.
- **Chrome 150/151 had a reported crash** involving WebMCP and client-side routers — worth knowing
  if you hit unexplained tab crashes with a router on those versions.

---

## 16. Sources

**Specification**

- WebMCP Draft Community Group Report — https://webmachinelearning.github.io/webmcp/
- WebMCP repository (explainers, issues) — https://github.com/webmachinelearning/webmcp
- Web Platform Tests — https://wpt.fyi/results/webmcp
- `webmcp-types` — https://github.com/webmachinelearning/webmcp-types

**Chrome**

- WebMCP overview — https://developer.chrome.com/docs/ai/webmcp
- Imperative API — https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Declarative API — https://developer.chrome.com/docs/ai/webmcp/declarative-api
- Best practices — https://developer.chrome.com/docs/ai/webmcp/best-practices
- Tool security — https://developer.chrome.com/docs/ai/webmcp/secure-tools
- Agent security considerations — https://developer.chrome.com/docs/agents/security
- Intent to Experiment — https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8

**OpenAI**

- Site tools — https://learn.chatgpt.com/docs/webmcp

**Ecosystem**

- MCP-B documentation — https://docs.mcp-b.ai/ (LLM index at `/llms.txt`)
- MCP-B packages — https://github.com/WebMCP-org/npm-packages
- WebMCP ecosystem adoption tracker — https://webmcp.com/ecosystem-tracker
- Angular WebMCP — https://angular.dev/ai/webmcp
- Edge origin trial — https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/
