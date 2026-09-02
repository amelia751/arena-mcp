/// <reference types="webmcp-types" />

export {};

declare global {
  interface Navigator {
    /**
     * Deprecated in Chrome 150 in favour of document.modelContext, and still the
     * only getter in some shipping agents, so it stays as a fallback.
     */
    readonly modelContext?: WebMCP.ModelContext;
  }
}
