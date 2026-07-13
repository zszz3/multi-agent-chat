import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { WorkflowV2GenerationReviewState } from "../../../../shared/workflow-v2/generation-review";
import { WorkflowReviewDrawer } from "./WorkflowReviewDrawer";

const review: WorkflowV2GenerationReviewState = {
  status: "changes_requested",
  reviewerConfiguredAgentId: "reviewer-agent",
  reviewerModelId: "reviewer-model",
  reviewedRevision: 4,
  updatedAt: 1,
  result: {
    verdict: "revise",
    reviewedRevision: 4,
    summary: "The graph needs a safer failure path.",
    findings: [{ severity: "blocking", nodeId: "search", summary: "Missing fallback", failurePath: "Search failure stops the workflow." }],
    scriptRisks: { transform: { level: "write", rationale: "Writes generated output to disk." } },
    suggestions: ["Add a retry or fallback route."],
  },
};

describe("WorkflowReviewDrawer", () => {
  test("presents review feedback as a structured workbench", () => {
    const html = renderToStaticMarkup(<WorkflowReviewDrawer
      open
      review={review}
      reviewerControls={<div>Reviewer controls</div>}
      canReview
      onReview={() => undefined}
      onClose={() => undefined}
    />);

    expect(html).toContain('aria-label="Review Agent"');
    expect(html).toContain("Review Agent");
    expect(html).toContain("Changes requested");
    expect(html).toContain("Review findings");
    expect(html).toContain("Missing fallback");
    expect(html).toContain("Script risk");
    expect(html).toContain("Add a retry or fallback route.");
    expect(html).toContain('aria-label="Close Review Agent"');
  });

  test("does not render when closed", () => {
    expect(renderToStaticMarkup(<WorkflowReviewDrawer
      open={false}
      reviewerControls={<div />}
      canReview
      onReview={() => undefined}
      onClose={() => undefined}
    />)).toBe("");
  });
});
