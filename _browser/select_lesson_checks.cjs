"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { discoverLessons } = require("./lesson-sources.cjs");

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

function all(lessons, reason) {
  return { lessons, reason };
}

function selectFromDiff(lessons, diff) {
  const entries = diff.split("\0");
  if (entries.pop() !== "" || entries.length % 2 !== 0) {
    return all(lessons, "Unexpected git diff format");
  }

  const selected = new Set();
  for (let i = 0; i < entries.length; i += 2) {
    const [status, file] = [entries[i], entries[i + 1]];
    // --no-renames represents a rename as a deletion and an addition.
    if (status !== "A" && status !== "M") {
      return all(lessons, "Deleted, renamed or changed-type path: " + JSON.stringify(file));
    }

    const matching = lessons.filter(lesson => lesson.path === file || (lesson.adapter && `assets/js/${lesson.adapter}` === file));
    if (matching.length) {
      for (const lesson of matching) selected.add(lesson.path);
    } else if (!contentOnlyPaths.has(file)) {
      return all(lessons, "Shared or unrecognized path: " + JSON.stringify(file));
    }
  }

  return { lessons: lessons.filter(lesson => selected.has(lesson.path)), reason: "Changed lesson dependencies" };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function selectVerification(lessons, env) {
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") {
    return all(lessons, "Full verification for non-main-push runs");
  }

  try {
    const head = git(["rev-parse", "HEAD"]).trim();
    if (head !== env.GITHUB_SHA) {
      return all(lessons, "Checkout differs from the push revision");
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
      return all(lessons, "Could not read successful Pages runs (HTTP " + response.status + ")");
    }

    const [run] = (await response.json()).workflow_runs;
    const base = run?.head_sha;
    if (!/^[0-9a-f]{40}$/.test(base ?? "") || base === head) {
      return all(lessons, "No earlier successful Pages run to compare");
    }
    git(["merge-base", "--is-ancestor", base, head]);

    console.log("Comparing with last successful Pages run " + base + " with " + head);
    return selectFromDiff(lessons, git(["diff", "--name-status", "-z", "--no-renames", base, head, "--"]));
  } catch {
    return all(lessons, "Could not determine changes from a successful Pages ancestor");
  }
}

if (require.main === module) {
  selectVerification(discoverLessons(), process.env).then(({ lessons, reason }) => {
    const paths = lessons.map(lesson => lesson.path);
    const sdkVersions = new Set(lessons.map(lesson => lesson.framework.slice(3) + ".x"));
    if (process.env.REBUILD_WASM9 === "true") sdkVersions.add("9.0.x");
    if (process.env.REBUILD_WASM10 === "true") sdkVersions.add("10.0.x");
    console.log(reason + ": " + (paths.join(", ") || "no lesson C# checks needed"));
    const sdkOutput = sdkVersions.size ? "sdk_versions<<SDK_VERSIONS\n" + [...sdkVersions].join("\n") + "\nSDK_VERSIONS\n" : "sdk_versions=\n";
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "lessons=" + JSON.stringify(paths) + "\n" + sdkOutput);
  });
}

module.exports = { selectFromDiff, selectVerification };
