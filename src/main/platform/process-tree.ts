import type { ChildProcess } from "node:child_process";

export type ProcessTerminationReason = "user-cancel" | "timeout" | "app-shutdown";

export interface ProcessTreeTerminationRequest {
  process: ChildProcess;
  reason: ProcessTerminationReason;
  requestProtocolCancellation?: () => Promise<void> | void;
}

export interface ProcessTreeController {
  terminate(request: ProcessTreeTerminationRequest): Promise<void>;
}
