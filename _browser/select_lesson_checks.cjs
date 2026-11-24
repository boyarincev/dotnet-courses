"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// The selected IDs control both the example and practice checks for each lesson.
const lessonPaths = {
  task001: [
    "_lessons/001-params-countby.md",
    "_browser/lesson001-program.cs",
    "_browser/verify_snippets.cjs",
    "assets/js/browser-snippets.js"
  ],
  task002: [
    "_lessons/002-aggregateby-null-conditional-assignment.md",
    "_browser/lesson002-program.cs",
    "_browser/verify_snippets.cjs",
    "_browser/verify_snippets_lesson2.cjs",
    "assets/js/browser-snippets-lesson002.js"
  ],
  alloc001: [
    "_memory_lessons/001-allocations-copies-retention.md",
    "_browser/memory-lesson001-program.cs",
    "assets/js/browser-snippets-memory001.js"
  ],
  task003: [
    "_lessons/003-ordered-dictionary-extension-indexers.md",
    "_browser/prepare_lesson003_check.cjs"
  ]
};
const allTasks = Object.keys(lessonPaths);
const contentOnlyPaths = new Set([
  "README.md",
  "COPYRIGHT.md",
  "index.md",
  "quiz.md",
  "courses/memory/quiz.md",
  "_data/questions.yml",
  "_data/memory_questions.yml",
  "assets/css/style.css"
]);

function all(reason) {
  return { tasks: allTasks, reason };
}

function selectFromDiff(diff) {
  const entries = diff.split("\0");
  if (entries.pop() !== "" || entries.length % 2 !== 0) {
    return all("Unexpected git diff format");
  }

  const selected = new Set();
  for (let i = 0; i < entries.length; i += 2) {
    const [status, file] = [entries[i], entries[i + 1]];
    // --no-renames represents a rename as a deletion and an addition.
    if (status !== "A" && status !== "M") {
      return all("Deleted, renamed or changed-type path: " + JSON.stringify(file));
    }

    const tasks = allTasks.filter(id => lessonPaths[id].includes(file));
    if (tasks.length) {
      for (const id of tasks) selected.add(id);
    } else if (!contentOnlyPaths.has(file)) {
      return all("Shared or unrecognized path: " + JSON.stringify(file));
    }
  }

  return { tasks: allTasks.filter(task => selected.has(task)), reason: "Changed lesson dependencies" };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function selectVerification(env) {
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") {
    return all("Full verification for non-main-push runs");
  }

  try {
    const head = git(["rev-parse", "HEAD"]).trim();
    if (head !== env.GITHUB_SHA) {
      return all("Checkout differs from the push revision");
    }

    // A cancelled or failed push may contain changes that still need checking.
    const url = new URL(env.GITHUB_API_URL + "/repos/" + env.GITHUB_REPOSITORY + "/actions/workflows/pages.yml/runs");
    url.search = new URLSearchParams({ branch: "main", status: "success", per_page: "1" });
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + env.GH_TOKEN,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return all("Could not read successful Pages runs (HTTP " + response.status + ")");
    }

    const [run] = (await response.json()).workflow_runs;
    const base = run?.head_sha;
    if (!/^[0-9a-f]{40}$/.test(base ?? "") || base === head) {
      return all("No earlier successful Pages run to compare");
    }
    git(["merge-base", "--is-ancestor", base, head]);

    console.log("Comparing with last successful Pages run " + base + " with " + head);
    return selectFromDiff(git(["diff", "--name-status", "-z", "--no-renames", base, head, "--"]));
  } catch {
    return all("Could not determine changes from a successful Pages ancestor");
  }
}

if (require.main === module) {
  selectVerification(process.env).then(({ tasks, reason }) => {
    console.log(reason + ": " + (tasks.join(", ") || "no lesson C# checks needed"));
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "tasks=" + JSON.stringify(tasks) + "\n");
  });
}

module.exports = { lessonPaths, selectFromDiff, selectVerification };
