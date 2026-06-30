---
name: file-reader
description: Read files within the workspace directory.
tags:
  - files
  - read
capabilities:
  - read_files
triggers:
  - read
  - file
consumes:
  - task
produces:
  - file_content
safe: true
chainable: true
---

Use this skill when the task involves reading a file from the workspace. Determine the file path from the task description, read the file content, and return it. If the path is relative, resolve it against the workspace root. If the file does not exist, report that clearly.
