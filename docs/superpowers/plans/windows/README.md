# Windows Adaptation Plans

These plans implement the [Windows Adaptation Program](../../specs/windows/2026-07-10-windows-adaptation-program.md).

Execute them in order. A phase may start only after the preceding phase satisfies its exit criteria.

1. [Phase 00: Baseline And Compatibility Matrix](2026-07-10-windows-phase-00-baseline-and-compatibility-matrix.md)
2. [Phase 01: Packaging And Desktop Shell](2026-07-10-windows-phase-01-packaging-and-desktop-shell.md)
3. [Phase 02: CLI, Process, And Filesystem Platform Layer](2026-07-10-windows-phase-02-cli-process-and-filesystem.md)
4. [Phase 03: Packaged MCP And Bundled Resources](2026-07-10-windows-phase-03-packaged-mcp-and-resources.md)
5. [Phase 04: Runtime Certification](2026-07-10-windows-phase-04-runtime-certification.md)
6. [Phase 05: CI, Signing, And Release](2026-07-10-windows-phase-05-ci-signing-and-release.md)

## Program Rule

- Windows-specific behavior belongs in platform adapters, packaging configuration, or runtime-local integration code.
- `AgentHub`, Chat, Task, and Workflow must remain platform-agnostic.
- Do not declare a Runtime supported on Windows until Phase 04 evidence exists.
- Do not accept a phase based only on macOS-hosted unit tests.
