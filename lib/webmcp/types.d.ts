/// <reference types="webmcp-types" />

// Chrome 149 still exposes the pre-May-2026 alias on Navigator; webmcp-types only declares Document.
interface Navigator {
  readonly modelContext?: WebMCP.ModelContext;
}
