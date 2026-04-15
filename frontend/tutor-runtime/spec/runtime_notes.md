# runtime_notes.md

## Purpose
Practical implementation notes for routes, tools, and file-context behavior.

---

## A. Routes

### A1. Text tutor
- No `open_course_material` in v1
- No artifact-creation assumptions unless explicitly supported by the text route
- Can tutor from course brain and any active context injected into the route
- Must never imply it switched tabs, opened files, or modified workspace

### A2. Live voice tutor
- `open_course_material` available in v1
- Generic `get_current_file_context` available
- Uses tools instead of verbally simulating workspace behavior
- May proactively open supported course PDFs when instructionally justified

---

## B. Course Material Viewer V1

### B1. Openable materials
V1 supports only PDF-friendly course materials:
- cases
- practice-question PDFs
- syllabus PDFs

Slides remain in the course brain for grounding only and are not openable in-session.

### B2. Artifact type
Use:
- `course_material_file`

Do not model course references as `uploaded_file`.

### B3. File tab
Reuse the existing `File` tab and viewer.

The file tab must support:
- uploaded file blobs
- app-served course material URLs

### B4. Canonical active file
The selected file is canonical.
Not the last tutor-opened file.

Selecting a different file changes the active tutor file context.

---

## C. Generic File Context Contract

The generic current-file context should expose:
- selected file id
- title
- summary
- mime type
- extracted text
- provenance
- optional materialId

Preferred tool:
- `get_current_file_context`

Compatibility alias:
- `get_current_uploaded_file_context`

Prompts and tutor behavior should migrate toward the generic tool.

---

## D. Course Material Opening Behavior

### D1. Success path
When `open_course_material(materialId, reason?)` succeeds:
- append `course_material_file` artifact
- select it as the active file
- switch workspace to `File` tab
- make it the active tutor file context

### D2. Failure path
If the tool fails:
- do not imply the file is open
- return a brief failure
- suggest the nearest supported reference if available

### D3. Unsupported materials
Non-openable `.pptx` or unsupported assets should fail cleanly.
Do not partially simulate slide review in v1.

---

## E. Artifact policy summary
Artifacts should be created only when:
- student-requested
- or instructionally justified for diagnosis, contrast, pressure testing, or error correction

Artifacts are not a substitute for diagnosis.

---

## F. Review policy summary
- Unsubmitted quiz: no answer reveal
- Submitted quiz: review allowed
- Worksheet answers: reveal only on explicit request for checking/solutions/review
- Current selected file: use `get_current_file_context` as source of truth

---

## G. Derived memory pilot
- Derived memory is injected only when available
- It should stay compact:
  - `2-4` recent study episodes
  - `0-1` confirmed profile memories
- It is supportive context for personalization and continuity
- It is not course truth and not mastery truth
