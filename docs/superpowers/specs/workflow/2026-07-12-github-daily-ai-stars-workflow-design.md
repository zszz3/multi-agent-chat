# GitHub Daily AI Stars Workflow Design

## Goal

Create an editable Workflow that discovers AI-related GitHub repositories created during the previous 24 hours, ranks them by current star count, and writes a Chinese Markdown daily report containing up to 10 verified projects.

This change creates the Workflow only. Scheduling it to run every day is a separate follow-up.

## Ranking Definition

- Compute the UTC cutoff at runtime as `now - 24 hours`.
- Search repositories created on or after the cutoff.
- Treat a repository as an AI candidate when its name, description, topics, or README materially relates to AI, LLMs, agents, RAG, machine learning, deep learning, model tooling, inference, or evaluation.
- Exclude forks, archived repositories, obvious keyword spam, empty placeholders, and duplicates.
- Rank accepted repositories by their current GitHub star count in descending order.
- Return at most 10 repositories. Never invent entries when fewer than 10 qualify.

GitHub's repository search API does not expose stars gained during a time window. This Workflow therefore ranks recently created repositories by current total stars, rather than claiming to measure daily star growth.

## Workflow Graph

```text
Start -> Collect GitHub Candidates -> Verify and Write Daily Report -> Done
```

### Collect GitHub Candidates

The collector calculates the time window, queries GitHub using several focused AI-related searches, and merges the results into a deduplicated candidate set. It should prefer the GitHub API through an available authenticated client, but may use the public API when credentials are unavailable.

The node records the query window, search method, repository URL, owner/name, description, topics, language, creation time, update time, star count, fork/archive state, and README evidence where available. It writes a concise candidate summary to shared Workflow context for the next node.

### Verify and Write Daily Report

The verifier checks each candidate's description, topics, and README evidence for substantive AI relevance. It removes unrelated or low-information entries, sorts the remaining repositories by star count, and selects the first 10.

It writes a Chinese Markdown report under the runtime Workflow output directory. The report includes:

- reporting period and collection timestamp;
- search method and ranking definition;
- a ranked table with repository name, GitHub link, stars, primary language, creation time, and short description;
- a short Chinese explanation of why each project is AI-related and worth noting;
- explicit caveats for incomplete GitHub responses, rate limits, or fewer than 10 qualifying projects.

The final response links to the generated report instead of duplicating the entire document in chat.

## Data Flow

The collector passes structured, source-linked candidate facts through shared Workflow context. The verifier treats those facts as evidence, revisits GitHub only when information is missing or inconsistent, and produces the only user-facing document.

No repository source code is modified. No GitHub token is written to Workflow memory or output documents.

## Failure Handling

- If authenticated GitHub access is unavailable, use the public API and report the limitation.
- If a query is rate-limited or fails, retry conservatively with fewer focused searches and preserve the error in the report.
- If no repository qualifies, still generate a valid report explaining that the result set is empty.
- If candidate metadata conflicts, prefer the latest GitHub repository response and note unresolved uncertainty.

## Acceptance Criteria

- The Workflow appears in the existing Workflow list and opens as an editable graph.
- The graph has exactly two executable Agent nodes between Start and Done.
- Node prompts calculate the 24-hour window at runtime and preserve GitHub source links.
- A successful run produces a Chinese Markdown report with no more than 10 repositories ordered by stars.
- Reports state the ranking definition and never describe current total stars as stars gained in the last day.
