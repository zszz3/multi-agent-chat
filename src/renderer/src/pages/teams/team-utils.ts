import type {
  AgentTeamMember,
  AgentTeamMode,
  AgentWorkflowNode,
  AgentWorkflowNodeStatus,
  ConfiguredAgent,
  TeamRun,
} from "../../../../shared/types";
import { defaultConfiguredAgentId } from "../../app/agents";

export const TEAM_MODE_OPTIONS: Array<{ id: AgentTeamMode; label: string; description: string }> = [
  { id: "pipeline", label: "Pipeline", description: "Run nodes one after another." },
  { id: "parallel", label: "Parallel", description: "Run all worker nodes at once." },
  { id: "supervisor", label: "Supervisor", description: "Lead plans, workers execute, lead synthesizes." },
];

export function teamModeLabel(mode: AgentTeamMode): string {
  return TEAM_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Pipeline";
}

export function workflowStatusForTeamMember(run: TeamRun | undefined, teamMemberId: string): AgentWorkflowNodeStatus {
  const workflowNode = run?.workflow?.nodes.find((node) => node.teamMemberId === teamMemberId);
  if (workflowNode) return workflowNode.status;
  const step = run?.steps.find((item) => item.teamMemberId === teamMemberId);
  return step?.status ?? "idle";
}

export function workflowStatusClass(status: AgentWorkflowNodeStatus): string {
  return status === "idle" ? "" : `is-${status}`;
}

export function workflowTraceNodesForRun(run: TeamRun): AgentWorkflowNode[] {
  const workflowNodes = run.workflow?.nodes.filter((node) => node.kind === "agent" || node.kind === "synthesis") ?? [];
  if (workflowNodes.length > 0) return workflowNodes;
  return run.steps.map((step): AgentWorkflowNode => ({
    id: step.id,
    kind: "agent",
    label: step.roleName,
    status: step.status,
    teamMemberId: step.teamMemberId,
    stepId: step.id,
  }));
}

export function reorderTeamMembers(
  members: AgentTeamMember[],
  draggedMemberId: string,
  targetMemberId: string | undefined,
): AgentTeamMember[] {
  if (draggedMemberId === targetMemberId) return members;
  const draggedIndex = members.findIndex((member) => member.id === draggedMemberId);
  if (draggedIndex < 0) return members;

  const draggedMember = members[draggedIndex];
  if (!draggedMember) return members;
  if (!targetMemberId) {
    const withoutDragged = members.filter((member) => member.id !== draggedMemberId);
    return [...withoutDragged, draggedMember];
  }

  const targetIndex = members.findIndex((member) => member.id === targetMemberId);
  if (targetIndex < 0) return members;
  const next = [...members];
  next[draggedIndex] = members[targetIndex]!;
  next[targetIndex] = draggedMember;
  return next;
}

export function draftWorkflowMembers(mode: AgentTeamMode, configuredAgents: ConfiguredAgent[]): AgentTeamMember[] {
  const configuredAgentId = defaultConfiguredAgentId(configuredAgents);
  const templates: Array<[string, string]> =
    mode === "parallel"
      ? [
          ["Research", "Inspect the target and collect relevant facts, files, and constraints."],
          ["Risk Review", "Review correctness, security, edge cases, and operational risks."],
          ["Verification", "Design or run verification steps and call out missing coverage."],
        ]
      : mode === "supervisor"
        ? [
            ["Lead", "Plan the work, assign focus areas, and reconcile the final answer."],
            ["Implementation Review", "Work from the lead plan and inspect implementation details."],
            ["Test Review", "Work from the lead plan and inspect verification gaps."],
          ]
        : [
            ["Planner", "Break down the target and produce a concise execution plan."],
            ["Worker", "Execute the plan and produce concrete findings or changes."],
            ["Reviewer", "Review the previous artifact and identify risks, gaps, and next steps."],
          ];

  return templates.map(([roleName, prompt], index) => ({
    id: `draft-${Date.now()}-${index}`,
    roleName,
    prompt,
    configuredAgentId,
  }));
}
