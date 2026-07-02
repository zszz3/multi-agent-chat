import type {
  AgentChannel,
  AgentRuntime,
  ConfiguredAgent,
  LocalFilePreview,
  RegisteredArtifact,
  WorkflowDraftState,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGrillMessage,
  WorkflowRunProgressItem,
  WorkflowStatus,
} from "../../../../shared/types";
import type { Language } from "../../app/language";

type MaybePromise = void | Promise<void>;

export interface WorkflowSidebarContextMenu {
  workflowId: string;
  x: number;
  y: number;
}

export interface WorkflowSidebarRenameDraft {
  workflowId: string;
  title: string;
}

export interface WorkflowSidebarController {
  workflows: WorkflowDraftState[];
  activeWorkflowId?: string;
  running: boolean;
  contextMenu?: WorkflowSidebarContextMenu;
  renameDraft?: WorkflowSidebarRenameDraft;
  onNewWorkflow: () => MaybePromise;
  onSelectWorkflow: (workflowId: string) => MaybePromise;
  onOpenContextMenu: (workflowId: string, x: number, y: number) => void;
  onStartRename: (workflowId: string) => MaybePromise;
  onRenameDraftChange: (title: string) => void;
  onConfirmRename: () => MaybePromise;
  onCancelRename: () => void;
  onDeleteWorkflow: (workflowId: string) => MaybePromise;
}

export interface WorkflowController {
  workflowId?: string;
  title?: string;
  status?: WorkflowStatus;
  graph: WorkflowGraph;
  graphReady: boolean;
  objective: string;
  messages: WorkflowGrillMessage[];
  reply: string;
  error: string | undefined;
  configuredAgentId: string;
  modelId?: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents?: ConfiguredAgent[];
  workDir: string;
  running: boolean;
  runProgress?: WorkflowRunProgressItem[];
  activeRunId?: string | undefined;
  artifacts?: RegisteredArtifact[];
  contextDocument?: string;
  finalReport?: string;
  onObjectiveChange: (value: string) => void;
  onPauseNode?: (nodeId: string) => MaybePromise;
  onStartNode?: (nodeId: string) => MaybePromise;
  onAnswerGate?: (nodeId: string, answer: string) => MaybePromise;
  onSelectConfiguredAgent: (configuredAgentId: string) => void;
  onSelectModel?: (modelId: string) => void;
  onDraftGraph: () => void;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onUpdateNode: (nodeId: string, update: Partial<WorkflowGraphNode>) => void;
  onRunGraph: () => MaybePromise;
  onResetSession: () => MaybePromise;
  onStopGrill?: () => void;
  onChooseWorkDir?: () => MaybePromise;
  onRefresh?: () => MaybePromise;
  onReadOutputFile?: (filePath: string) => Promise<LocalFilePreview>;
  onListOutputs?: () => Promise<Array<{ name: string; path: string }>>;
  language?: Language;
  defaultGraphExpanded?: boolean;
}
