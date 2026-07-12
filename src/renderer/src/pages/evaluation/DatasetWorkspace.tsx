import { Database, Save, Trash2 } from "lucide-react";
import type { EvaluationDataset } from "../../../../shared/types";
import {
  BrowserHeader,
  BrowserItem,
  DetailToolbar,
  WorkbenchEmpty,
  WorkbenchLayout,
  WorkbenchSection,
} from "../../ui/workbench/Workbench";

export function DatasetWorkspace({
  zh,
  datasets,
  selected,
  busy,
  onSelect,
  onCreate,
  onChange,
  onSave,
  onDelete,
}: {
  zh: boolean;
  datasets: EvaluationDataset[];
  selected: EvaluationDataset | undefined;
  busy: string | undefined;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onChange: (value: EvaluationDataset) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <WorkbenchLayout
      browser={
        <>
          <BrowserHeader
            label={zh ? "数据集" : "Datasets"}
            actionLabel={zh ? "新建数据集" : "New dataset"}
            onAdd={onCreate}
          />
          <div className="workbench-browser-list">
            {datasets.map((item) => (
              <BrowserItem
                key={item.id}
                selected={item.id === selected?.id}
                title={item.name}
                meta={`${item.items.length} cases · ${new Date(item.updatedAt).toLocaleDateString()}`}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </div>
        </>
      }
    >
      {selected ? (
        <>
          <DetailToolbar
            title={selected.name}
            meta={`${selected.items.length} cases · ${selected.id}`}
            actions={
              <>
                <button
                  className="secondary-btn danger"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={onDelete}
                >
                  <Trash2 size={13} />
                  {zh ? "删除" : "Delete"}
                </button>
                <button
                  className="primary-btn"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={onSave}
                >
                  <Save size={13} />
                  {busy === "save"
                    ? zh
                      ? "保存中"
                      : "Saving"
                    : zh
                      ? "保存"
                      : "Save"}
                </button>
              </>
            }
          />
          <div className="workbench-scroll">
            <WorkbenchSection title={zh ? "基本信息" : "Details"}>
              <div className="workbench-form-grid">
                <label>
                  <span>{zh ? "名称" : "Name"}</span>
                  <input
                    value={selected.name}
                    onChange={(event) =>
                      onChange({ ...selected, name: event.target.value })
                    }
                  />
                </label>
                <label className="is-wide">
                  <span>{zh ? "描述" : "Description"}</span>
                  <input
                    value={selected.description}
                    onChange={(event) =>
                      onChange({ ...selected, description: event.target.value })
                    }
                  />
                </label>
              </div>
            </WorkbenchSection>
            <WorkbenchSection
              title={zh ? "测试 Case" : "Test cases"}
              description={
                zh
                  ? "每个 Case 包含发送给 Agent 的输入和可选期望结果。"
                  : "Each case contains an Agent input and an optional expected result."
              }
              action={
                <button
                  className="secondary-btn compact"
                  type="button"
                  onClick={() => {
                    const now = Date.now();
                    onChange({
                      ...selected,
                      items: [
                        ...selected.items,
                        {
                          id: `item-${now}`,
                          input: "",
                          metadata: {},
                          sequence: selected.items.length,
                        },
                      ],
                    });
                  }}
                >
                  + Case
                </button>
              }
            >
              <div className="dataset-case-table">
                <div className="dataset-case-head">
                  <span>#</span>
                  <span>Input</span>
                  <span>Expected output</span>
                  <span />
                </div>
                {selected.items.map((item, index) => (
                  <div className="dataset-case-row" key={item.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <textarea
                      aria-label={`Case ${index + 1} input`}
                      value={item.input}
                      placeholder={
                        zh ? "输入测试问题或任务" : "Enter a test prompt"
                      }
                      onChange={(event) =>
                        onChange({
                          ...selected,
                          items: selected.items.map((current) =>
                            current.id === item.id
                              ? { ...current, input: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                    <textarea
                      aria-label={`Case ${index + 1} expected output`}
                      value={item.expectedOutput ?? ""}
                      placeholder={
                        zh ? "可选，用于匹配评估" : "Optional expected result"
                      }
                      onChange={(event) =>
                        onChange({
                          ...selected,
                          items: selected.items.map((current) =>
                            current.id === item.id
                              ? {
                                  ...current,
                                  expectedOutput: event.target.value,
                                }
                              : current,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-btn danger"
                      type="button"
                      aria-label={zh ? "删除 Case" : "Delete case"}
                      title={zh ? "删除 Case" : "Delete case"}
                      onClick={() =>
                        onChange({
                          ...selected,
                          items: selected.items.filter(
                            (current) => current.id !== item.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </WorkbenchSection>
          </div>
        </>
      ) : (
        <WorkbenchEmpty
          icon={<Database size={22} />}
          title={zh ? "还没有数据集" : "No datasets"}
          description={
            zh
              ? "先建立一组可重复运行的测试输入。"
              : "Create reusable test inputs for your Agents."
          }
          actionLabel={zh ? "新建数据集" : "New dataset"}
          onAction={onCreate}
        />
      )}
    </WorkbenchLayout>
  );
}
