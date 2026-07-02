import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadBundledWorkflows } from "./bundled-workflows";

describe("loadBundledWorkflows", () => {
  test("loads a workflow and injects the template asset into the render node", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bundled-wf-"));
    const dir = path.join(root, "resume");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "resume-template.html"), "<html>{{姓名}}</html>\n", "utf8");
    await writeFile(path.join(dir, "resume-guidelines.md"), "问题→方案→量化\n", "utf8");
    await writeFile(
      path.join(dir, "workflow.json"),
      JSON.stringify({
        id: "bundled-resume-html",
        title: "简历生成 (HTML)",
        objective: "obj",
        assets: { __RESUME_TEMPLATE__: "resume-template.html", __RESUME_GUIDE__: "resume-guidelines.md" },
        graph: {
          title: "简历生成 (HTML)",
          objective: "obj",
          nodes: [
            { id: "start", kind: "start", title: "开始", prompt: "" },
            { id: "render", kind: "agent", title: "渲染", prompt: "写法:\n__RESUME_GUIDE__\n模版:\n__RESUME_TEMPLATE__\n结束" },
            { id: "end", kind: "end", title: "完成", prompt: "" },
          ],
          edges: [
            { id: "start->render", fromNodeId: "start", toNodeId: "render" },
            { id: "render->end", fromNodeId: "render", toNodeId: "end" },
          ],
        },
      }),
      "utf8",
    );

    const defs = await loadBundledWorkflows(root);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ workflowId: "bundled-resume-html", title: "简历生成 (HTML)" });
    const render = defs[0]?.graph.nodes.find((node) => node.id === "render");
    expect(render?.prompt).toContain("<html>{{姓名}}</html>");
    expect(render?.prompt).toContain("问题→方案→量化");
    expect(render?.prompt).not.toContain("__RESUME_TEMPLATE__");
    expect(render?.prompt).not.toContain("__RESUME_GUIDE__");
  });

  test("returns empty for a missing root", async () => {
    expect(await loadBundledWorkflows(path.join(os.tmpdir(), "does-not-exist-xyz"))).toEqual([]);
  });
});
