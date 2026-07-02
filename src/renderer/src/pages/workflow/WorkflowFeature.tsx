import { WorkflowPage } from "./WorkflowPage";
import type { WorkflowController } from "./workflow-controller";

export function WorkflowFeature({ controller }: { controller: WorkflowController }) {
  return <WorkflowPage controller={controller} />;
}
