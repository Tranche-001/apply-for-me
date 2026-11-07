---
name: save-session-local
description: Save the current session (what was built, what worked, what failed, what's left, exact next step) to a dated file inside this project's .claude/session-data/ folder, so a later session can resume with /resume-session-local. Use at the end of a work session, before context runs out, or when handing off.
---

# Save Session (project-local)

Same format as ECC's `/save-session`, but the file lives **in this project**, not in `~/.claude/session-data/`.

## Where

- Folder: `<project root>/.claude/session-data/` — the project root is the folder that contains `.claude/` (for apply-for-me: `/home/visioer/Projetos_Pessoais/apply-for-me`). Create it if missing. It is git-ignored.
- File name: `YYYY-MM-DD-<short-id>-session.tmp`, today's date and a short id of lowercase letters, digits and hyphens (8+ chars), describing the topic, e.g. `2026-11-07-job-analysis-v2-session.tmp`.
- **One file per session; never append to an older file.** If today's file for the same topic exists, pick a new short id.

## Steps

1. **Gather context:** `git status --short` and `git diff --stat` in every repo of the project, what was decided and attempted in the conversation, errors hit and how they were solved, and the latest test/build results.
2. **Write the file** with every section below. Write "Nothing yet" / "N/A" instead of skipping a section.
3. **Never write secrets** (passwords, API keys, tokens, connection-string passwords). Name the variable and where it lives (e.g. "`GEMINI_API_KEY` in `web/.env`") instead. Never copy CV text with personal contact details (phone, e-mail, address) into the file.
4. **Show the full file to the user** and ask: "Session saved to `<absolute path>`. Does this look accurate? Anything to correct or add?" Apply corrections if asked.

## Sections (in this order)

```markdown
# Session: YYYY-MM-DD

**Started:** … **Last Updated:** … **Project:** <path> **Topic:** <one line>

## What We Are Building
## What WORKED (with evidence)        — each item with how it was confirmed (test output, HTTP status, log line)
## What Did NOT Work (and why)        — exact error/reason, so nobody retries it blindly (most important section)
## What Has NOT Been Tried Yet
## Current State of Files             — table: File | Status (PASS: Complete / In Progress / FAIL: Broken / Not Started) | Notes
## Decisions Made                     — decision + reason, so they are not relitigated
## Blockers & Open Questions          — include anything waiting on the user (approvals, confirmations)
## Exact Next Step                    — precise enough to start with zero thinking
## Environment & Setup Notes          — commands, services, env var names (no values); omit if standard
```

Items without evidence go to "What Has NOT Been Tried Yet", not "What WORKED".
