import type {
  WorkflowV2ProgressReport,
  WorkflowV2SupervisorResolution,
} from "../../../shared/workflow-v2/supervision";
import type { RuntimeConversation } from "../../../shared/types";

export class WorkflowV2SupervisionSignal extends Error {
  readonly resolution: Exclude<WorkflowV2SupervisorResolution, { action: "continue" }>;
  readonly report: WorkflowV2ProgressReport;
  readonly resumeConversation: RuntimeConversation | undefined;

  constructor(input: {
    resolution: Exclude<WorkflowV2SupervisorResolution, { action: "continue" }>;
    report: WorkflowV2ProgressReport;
    resumeConversation?: RuntimeConversation;
  }) {
    super(input.resolution.reason);
    this.name = "WorkflowV2SupervisionSignal";
    this.resolution = structuredClone(input.resolution);
    this.report = structuredClone(input.report);
    this.resumeConversation = input.resumeConversation ? structuredClone(input.resumeConversation) : undefined;
  }
}
