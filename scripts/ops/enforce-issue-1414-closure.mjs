#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { evaluateIssue1414Acceptance } from "../lib/issue-1414-closure-guard.mjs";

const eventPath = String(process.env.GITHUB_EVENT_PATH ?? "").trim();
const token = String(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "").trim();
const apiBase = String(process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
let event = {};
if (eventPath) {
  try {
    event = JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (error) {
    throw new Error(`GITHUB_EVENT_READ_FAILED:${error?.message ?? String(error)}`);
  }
}

const eventIssueNumber = Number(event?.issue?.number ?? 0);
const eventName = String(process.env.GITHUB_EVENT_NAME ?? "").trim();
if (eventName === "issues" && eventIssueNumber !== 1414) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: "not_issue_1414" }));
  process.exit(0);
}

if (!token) throw new Error("GITHUB_TOKEN_REQUIRED_FOR_ISSUE_1414_GUARD");

const repository = String(event?.repository?.full_name ?? process.env.GITHUB_REPOSITORY ?? "").trim();
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY_REQUIRED");
}

const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28",
};

const issueUrl = `${apiBase}/repos/${repository}/issues/1414`;
const issueResponse = await fetch(issueUrl, { headers });
if (!issueResponse.ok) {
  throw new Error(`ISSUE_1414_READ_FAILED:${issueResponse.status}:${(await issueResponse.text()).slice(0, 500)}`);
}
const issue = await issueResponse.json();
const state = String(issue?.state ?? "").toLowerCase();
const evaluation = evaluateIssue1414Acceptance(issue?.body ?? "");

if (state !== "closed") {
  console.log(JSON.stringify({
    ok: true,
    reopened: false,
    reason: "master_tracker_already_open",
    unchecked_acceptance_count: evaluation.uncheckedAcceptanceCount,
    missing_required_live_acceptance: evaluation.missingRequiredLiveAcceptance.length,
  }));
  process.exit(0);
}

if (evaluation.accepted) {
  console.log(JSON.stringify({ ok: true, reopened: false, reason: "master_acceptance_complete" }));
  process.exit(0);
}

const reopenResponse = await fetch(issueUrl, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ state: "open" }),
});
if (!reopenResponse.ok) {
  throw new Error(`ISSUE_1414_REOPEN_FAILED:${reopenResponse.status}:${(await reopenResponse.text()).slice(0, 500)}`);
}

const details = evaluation.uncheckedAcceptance.slice(0, 12);
const commentLines = [
  "## Automatic closure guard reopened #1414",
  "",
  "The master commercial-launch tracker was closed before its acceptance contract was complete.",
  "",
  `- unchecked acceptance items in Sections 1–13: **${evaluation.uncheckedAcceptanceCount}**`,
  `- required live-payment acceptance markers missing: **${evaluation.missingRequiredLiveAcceptance.length}**`,
  "- Section 14 legacy-workstream checkboxes are intentionally excluded from this closure decision because the tracker says they may remain open after launch.",
  "- The guard also runs periodically, so a delayed issue-close event cannot leave the incomplete tracker closed indefinitely.",
  "",
];
if (details.length > 0) {
  commentLines.push("Examples still open:");
  for (const line of details) commentLines.push(`- ${line.replace(/^[-*]\s*/, "")}`);
  if (evaluation.uncheckedAcceptanceCount > details.length) {
    commentLines.push(`- …and ${evaluation.uncheckedAcceptanceCount - details.length} more.`);
  }
  commentLines.push("");
}
commentLines.push("#1414 may be closed only after Sections 1–13 are fully checked **and** the explicit 0.05 USDC live-payment/paid-response acceptance is recorded.");

const commentResponse = await fetch(`${issueUrl}/comments`, {
  method: "POST",
  headers,
  body: JSON.stringify({ body: commentLines.join("\n") }),
});
if (!commentResponse.ok) {
  throw new Error(`ISSUE_1414_GUARD_COMMENT_FAILED:${commentResponse.status}:${(await commentResponse.text()).slice(0, 500)}`);
}

console.log(JSON.stringify({
  ok: true,
  reopened: true,
  unchecked_acceptance_count: evaluation.uncheckedAcceptanceCount,
  missing_required_live_acceptance: evaluation.missingRequiredLiveAcceptance.length,
}));
