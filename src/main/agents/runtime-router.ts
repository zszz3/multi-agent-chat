import type { AgentExecutionContext, AgentExecutor } from "../agent-executor";
import type { AgentId, AgentRuntime, RuntimeContinuationPolicy, RuntimeConversation, RuntimeExecutionMode } from "../../shared/types";
import {
  RuntimeDriverRegistry,
} from "./runtime-driver";
import type {
  InteractiveSession,
  InteractiveSessionContext,
  RuntimeChannelTestContext,
  RuntimeDriver,
  RuntimeSessionCleanupContext,
  RuntimeSurface,
  RuntimeWorkflowRequestContext,
} from "./runtime-driver";
import type { RuntimeCapabilities } from "./runtime-capabilities";
import type { RuntimeStateCodec } from "./runtime-state-codec";

type RuntimeRequestLike = {
  runtimeId: AgentId;
  executionMode: RuntimeExecutionMode;
  continuationPolicy: RuntimeContinuationPolicy;
  runtimeConversation?: RuntimeConversation;
};

export class RuntimeRouter {
  constructor(private readonly registry: RuntimeDriverRegistry) {}

  capabilitiesFor(runtime: AgentRuntime): RuntimeCapabilities {
    return this.registry.driverFor(runtime.id).getCapabilities(runtime);
  }

  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor {
    const surface: RuntimeSurface = context.runKind === "chat" ? "chat" : "task";
    const driver = this.validateRequest(surface, context);
    if (!driver.createOneShotExecutor) {
      throw new Error(`${context.runtimeId} runtime does not provide one-shot execution for ${surface}.`);
    }
    return driver.createOneShotExecutor(context);
  }

  createInteractiveSession(context: InteractiveSessionContext): InteractiveSession {
    const driver = this.validateRequest("chat", context);
    if (!driver.createInteractiveSession) {
      throw new Error(`${context.runtimeId} runtime does not provide interactive chat sessions.`);
    }
    return driver.createInteractiveSession(context);
  }

  async askWorkflow(input: RuntimeWorkflowRequestContext) {
    const driver = this.validateRequest("workflow", input);
    if (!driver.askWorkflow) {
      throw new Error(`${input.runtimeId} runtime does not provide workflow execution.`);
    }
    return driver.askWorkflow(input);
  }

  async testChannel(runtimeId: AgentId, input: RuntimeChannelTestContext): Promise<string> {
    const driver = this.validateSurface(runtimeId, "channel-test");
    if (!driver.testChannel) {
      throw new Error(`${runtimeId} runtime testing is not configured.`);
    }
    return driver.testChannel(input);
  }

  async deleteSessionArtifacts(runtimeId: AgentId, input: RuntimeSessionCleanupContext): Promise<void> {
    const driver = this.validateSurface(runtimeId, "cleanup");
    if (!driver.deleteSessionArtifacts) {
      throw new Error(`${runtimeId} runtime cleanup is not configured.`);
    }
    const runtimeConversation = input.runtimeConversation ? this.cloneConversation(input.runtimeConversation) : undefined;
    await driver.deleteSessionArtifacts({
      workDir: input.workDir,
      ...(runtimeConversation ? { runtimeConversation } : {}),
    });
  }

  restorePersistedConversation(raw: unknown): RuntimeConversation | undefined {
    const envelope = this.asRuntimeConversationEnvelope(raw);
    if (!envelope) return undefined;
    const driver = this.registry.maybeDriverFor(envelope.runtimeId);
    if (!driver?.runtimeStateCodec) return undefined;
    return driver.runtimeStateCodec.restorePersistedConversation(raw);
  }

  cloneConversation(conversation: RuntimeConversation): RuntimeConversation {
    const driver = this.registry.maybeDriverFor(conversation.runtimeId);
    if (!driver) {
      throw new Error(`No runtime driver registered for ${conversation.runtimeId}`);
    }
    const codec = this.requireRuntimeStateCodec(driver, conversation.runtimeId);
    const cloned = codec.cloneConversation(conversation);
    if (!cloned) {
      throw new Error(`Invalid ${conversation.runtimeId} runtime conversation envelope.`);
    }
    return cloned;
  }

  private validateRequest<T extends RuntimeRequestLike>(surface: RuntimeSurface, input: T): RuntimeDriver {
    const driver = this.validateSurface(input.runtimeId, surface);
    const support = driver.surfaceSupport.find((item) => item.surface === surface);
    const executionMode = input.executionMode;
    const continuationPolicy = input.continuationPolicy;
    const supported =
      support?.executionModes.includes(executionMode) &&
      support.continuationPolicies.includes(continuationPolicy);
    if (!supported) {
      throw new Error(`${input.runtimeId} does not support ${surface} ${executionMode} with continuation policy ${continuationPolicy}.`);
    }
    if (continuationPolicy === "resume-required" && !input.runtimeConversation) {
      throw new Error(`${input.runtimeId} ${surface} ${executionMode} requires runtimeConversation for continuation policy resume-required.`);
    }
    if (input.runtimeConversation && input.runtimeConversation.runtimeId !== input.runtimeId) {
      throw new Error(
        `${input.runtimeId} cannot use runtimeConversation owned by ${input.runtimeConversation.runtimeId}.`,
      );
    }
    if (continuationPolicy !== "fresh" && !driver.runtimeStateCodec) {
      throw new Error(`${input.runtimeId} does not support ${surface} ${executionMode} with continuation policy ${continuationPolicy}.`);
    }
    if (input.runtimeConversation) {
      this.cloneConversation(input.runtimeConversation);
    }
    return driver;
  }

  private validateSurface(runtimeId: AgentId, surface: RuntimeSurface): RuntimeDriver {
    const driver = this.registry.driverFor(runtimeId);
    if (!driver.surfaceSupport.some((item) => item.surface === surface)) {
      throw new Error(`${runtimeId} runtime does not support ${surface}.`);
    }
    return driver;
  }

  private asRuntimeConversationEnvelope(raw: unknown): RuntimeConversation | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const record = raw as Record<string, unknown>;
    if (typeof record.runtimeId !== "string") return undefined;
    if (typeof record.codecVersion !== "string") return undefined;
    if (!Object.prototype.hasOwnProperty.call(record, "payload")) return undefined;
    return {
      runtimeId: record.runtimeId as AgentId,
      codecVersion: record.codecVersion,
      payload: structuredClone(record.payload),
    };
  }

  private requireRuntimeStateCodec(driver: RuntimeDriver, runtimeId: AgentId): RuntimeStateCodec<unknown> {
    if (!driver.runtimeStateCodec) {
      throw new Error(`${runtimeId} runtime does not support persisted runtime conversations.`);
    }
    return driver.runtimeStateCodec;
  }
}
