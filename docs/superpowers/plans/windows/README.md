# Windows Adaptation Plans

These plans implement the [Windows Adaptation Program](../../specs/windows/2026-07-10-windows-adaptation-program.md).

Execute them in order. A phase may start only after the preceding phase satisfies its exit criteria.

1. [Phase 00: Baseline And Compatibility Matrix](2026-07-10-windows-phase-00-baseline-and-compatibility-matrix.md)
2. [Phase 01: Packaging And Desktop Shell](2026-07-10-windows-phase-01-packaging-and-desktop-shell.md)
3. [Phase 02: CLI, Process, And Filesystem Platform Layer](2026-07-10-windows-phase-02-cli-process-and-filesystem.md)
4. [Phase 03: Packaged MCP And Bundled Resources](2026-07-10-windows-phase-03-packaged-mcp-and-resources.md)
5. [Phase 04: Runtime Certification](2026-07-10-windows-phase-04-runtime-certification.md)
6. [Phase 05: CI, Signing, And Release](2026-07-10-windows-phase-05-ci-signing-and-release.md)

## Progress Snapshot

- Phase 00: planning baseline defined; Windows-hosted compatibility evidence is still required.
- Phase 01: in progress; cross-platform window/resources and cross-built NSIS artifacts are implemented, while Windows install/upgrade/uninstall validation is pending.
- Phase 02: in progress; executable discovery with refreshable caching, Main composition, shared process-tree strategies, production Runtime lifecycle injection, local-file containment, and managed skill-link ownership are implemented, while classified remediation, compatibility cleanup, and Windows integration evidence are pending.
- Phases 03-05: proposed and dependent on the earlier phase contracts and Windows evidence.

## Program Rule

- Windows-specific behavior belongs in platform adapters, packaging configuration, or runtime-local integration code.
- platform strategies are composed once behind `PlatformServices`; consumers do not scatter `process.platform` checks.
- `AgentHub`, Chat, Task, and Workflow must remain platform-agnostic.
- Do not declare a Runtime supported on Windows until Phase 04 evidence exists.
- platform support and local executable availability are separate typed states enforced by contract tests.
- Do not accept a phase based only on macOS-hosted unit tests.
