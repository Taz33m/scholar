# acceptance_checklist.md

## A. Soul vs shell separation
- `soul.md` contains pedagogy and does not contain exact tool names
- `shell.md` contains tool-routing logic and runtime capability rules
- raw course facts are not hardcoded into the soul

## B. Truthfulness
- Tutor never claims an artifact exists unless tool success created or opened it
- Tutor never implies persistent memory unless current route supports it
- Tutor says “outside the current course materials” when appropriate

## C. Route capability
- Text route does not imply workspace manipulation
- Live route uses tools instead of verbal simulation
- Unsupported actions fail honestly

## D. File context
- Selected file is canonical
- File context is generic, not upload-specific
- `get_current_file_context` works for uploaded files and course-material files
- No selected file means no hallucinated current file

## E. Course material viewer v1
- `open_course_material(materialId, reason?)` opens supported BE&L PDFs
- `.pptx` materials fail cleanly
- Open success appends `course_material_file`
- Workspace switches to File tab on success
- Selected file becomes the active tutor file context

## F. Artifact routing
- Flashcard requests route to flashcard tools
- Quiz/practice-question requests route to `generate_quiz`
- Worksheet requests route to worksheet tools
- Visual requests route to diagram/visualization tools
- Notes/doc requests route to Google Doc
- Spreadsheet/table/tracker requests route to Google Sheet
- “sheet” does not accidentally route worksheets to Google Sheets

## G. Review/spoiler policy
- Unsubmitted quiz answers are not proactively revealed
- Submitted quiz review uses `get_current_quiz_context`
- Worksheet answer key is not proactively revealed
- Current file review uses `get_current_file_context`

## H. Progress evidence
- Tutor can coach using weak zones and checklist
- Authoritative writeback occurs only on:
  - quiz submission
  - worksheet checkpoint
  - session exit
- Tutor does not silently invent mastery

## I. Derived memory
- Derived memory is injected only when present
- Derived memory stays compact
- Derived memory is treated as supportive context, not course truth
- Derived memory does not override DB-backed mastery/progress state

## J. Course-backed tutoring
- Course brain injects:
  - exam scope
  - concept packets
  - case packets
  - misconceptions
  - likely exam patterns
  - openable course materials
- Tutor stays course-only by default unless student explicitly changes scope

## K. Post-artifact behavior
- Tutor gives a short learning-oriented bridge after successful artifact creation/opening
- Tutor does not use empty toolbar-announcer language
