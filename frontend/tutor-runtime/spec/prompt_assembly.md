# prompt_assembly.md

## Goal
Assemble the runtime prompt stack in a way that cleanly separates pedagogy, operational constraints, course truth, and student state.

---

## Prompt Stack Order

### 1. Base system/runtime instructions
Global platform rules, model safety, and universal behavior constraints.

### 2. shell.md
Operational shell:
- truthfulness
- route capability rules
- tool routing
- artifact policies
- spoiler/review rules
- file-context rules
- course-material viewer rules
- error handling

### 3. soul.md
Pedagogical identity and method:
- diagnose before teaching
- ask first, tell second
- recall/contrast/application/error-correction style
- mastery standard
- end-of-session format

### 4. Active course brain
Inject the active course brain for the current course, including:
- exam scope
- concept packets
- case packets
- misconceptions
- likely exam patterns
- openable course materials

### 5. Active student state
Inject current student-specific state:
- selected file state
- weak zones
- progress snapshot
- checklist
- authoritative evidence sources when present

### 6. Derived memory context
Inject compact derived memory only when available:
- recent study memory
- confirmed profile memory

This block is supportive context only.
It is not course truth and not mastery truth.

### 7. Runtime tool surface
Expose only the tools available on the current route.

The soul should never assume a tool exists.
The shell should gate behavior based on the actual route/tool surface.

---

## Recommended Internal Framing
The assembled tutor should behave as though it has five layers:

- Soul: how do I teach
- Shell: what may I claim or do
- Course brain: what is true for this course
- Student state: what is true for this student right now
- Derived memory: what recent prior context may help personalize this session

---

## Route-Specific Prompt Notes

### Text tutor route
- Do not expose file-opening powers
- Do not expose artifact-creation powers unless actually supported
- May consume current file context if the runtime explicitly provides it
- Must not imply workspace manipulation

### Live voice tutor route
- Expose live tool surface
- Encourage tool use instead of verbal simulation
- Allow short bridging language around successful tool calls

---

## File Context Injection
When a selected file exists and file context is available, inject a generic active file context block:

- selected file id
- title
- summary
- mime type
- extracted text
- provenance
- optional materialId

This block should be treated as current-file truth.

When no file is selected, do not inject fake current-file content.

---

## Authoritative Progress Injection
Only label progress as authoritative when it came from:
- quiz submission
- worksheet checkpoint
- session exit

Live inferred weakness can still be injected, but should be marked provisional.

---

## Derived Memory Injection
Inject derived memory only when it is available and compact.

Prefer:
- 2-4 recent study episodes
- 0-1 confirmed profile memories

Each entry should expose only:
- label
- summary
- trustClass
- confidence
- provenance
- timestamp or status

The tutor should treat this as personalization context, not as course fact or mastery fact.

---

## Openable Course Materials Injection
Inject stable openable-course-material entries so the model has deterministic IDs for `open_course_material`.

Each entry should expose:
- materialId
- title
- kind
- mimeType
- openableInSession

Do not expose unsupported material types as openable.
