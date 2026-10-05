#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { evaluateIssue1414Acceptance } from "../lib/issue-1414-closure-guard.mjs";

const eventPath = String(process.env.GITHUB_EVENT_PATH ?? "").trim();
const token = String(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "").trim();
const apiBase = String(process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

if (!eventPath) throw new Error("GITHUB_EVENT_PATH_REQUIRED");

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const issueNumber = Number(event?.issue?.number ?? 0);
const action = String(event?.action ?? "");

if (issueNumber !== 1414 || action !== "closed") {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: "not_1414_closed_event" }));
  process.exit(0);
}

const evaluation = evaluateIssue1414Acceptance(event?.issue?.body ?? "");
if (evaluation.accepted) {
  console.log(JSON.stringify({ ok: true, reopened: false, reason: "master_acceptance_complete" }));
  process.exit(0);
}

if (!token) throw new Error("GITHUB_TOKEN_REQUIRED_FOR_REOPEN");

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
