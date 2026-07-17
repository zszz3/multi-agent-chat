import { useState } from "react";
import { X } from "lucide-react";
import type { WorkflowV2Definition } from "../../../../shared/types";
import { validateWorkflowV2Definition } from "../../../../shared/workflow-v2/validation";

export function WorkflowDraftEditorDialog(props: {
  definition: WorkflowV2Definition;
  onSave: (definition: WorkflowV2Definition) => void | Promise<void>;
  onClose: () => void;
}) {
  const [definitionJson, setDefinitionJson] = useState(() => JSON.stringify(props.definition, null, 2));
  const [error, setError] = useState<string | undefined>();

  async function save(): Promise<void> {
    try {
      const definition = JSON.parse(definitionJson) as WorkflowV2Definition;
      const validation = validateWorkflowV2Definition(definition);
      if (!validation.valid) throw new Error(validation.errors.join("\n"));
      await props.onSave(definition);
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <div className="workflow-revision-backdrop" role="presentation" onClick={props.onClose}>
    <section className="workflow-revision-dialog" role="dialog" aria-modal="true" aria-label="Edit workflow definition" onClick={(event) => event.stopPropagation()}>
      <header><div><strong>Edit workflow definition</strong><span>Saving creates a new draft revision. Previous runs keep their original graph version.</span></div><button className="icon-btn" onClick={props.onClose} aria-label="Close workflow editor"><X size={15} /></button></header>
      <label>Workflow definition<textarea aria-label="Workflow definition JSON" value={definitionJson} onChange={(event) => setDefinitionJson(event.currentTarget.value)} spellCheck={false} /></label>
      {error ? <div className="workflow-error">{error}</div> : null}
      <footer><button className="control-btn" onClick={props.onClose}>Cancel</button><button className="send-btn" onClick={() => void save()}>Validate &amp; save new revision</button></footer>
    </section>
  </div>;
}
