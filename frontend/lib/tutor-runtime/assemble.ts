import {
  TUTOR_RUNTIME_ACCEPTANCE_CHECKLIST_MARKDOWN,
  TUTOR_RUNTIME_PROMPT_ASSEMBLY_MARKDOWN,
  TUTOR_RUNTIME_SHELL_MARKDOWN,
  TUTOR_RUNTIME_SOUL_MARKDOWN,
  TUTOR_RUNTIME_SPEC_MANIFEST,
} from "@/lib/tutor-runtime/generated-spec";
import { formatPromptToolSurfaceBlock } from "@/lib/tutor-runtime/tool-surface";
import type {
  PromptAssemblyInput,
  PromptAssemblyReport,
  PromptAssemblyResult,
  PromptCourseBrain,
  PromptStudentState,
} from "@/lib/tutor-runtime/types";
import {
  validatePromptCourseBrain,
  validatePromptStudentState,
} from "@/lib/tutor-runtime/validators";
import type { DerivedMemoryContext } from "@/types/student-memory";
import type { FileSessionContext } from "@/types/session";

const BASE_RUNTIME_INSTRUCTIONS = [
  "Base runtime instructions:",
  "- Treat the shell as operational law, the soul as pedagogy, the course brain as course truth, and the student state as current evidence.",
  "- Follow the runtime capabilities actually exposed on this route.",
  "- Never reveal hidden reasoning or internal planning.",
  "- Respond directly to the student.",
].join("\n");

const MAX_PROMPT_CHARACTERS = 40_000;
const MAX_WEAK_ZONES = 4;
const MAX_CHECKLIST_ITEMS = 5;
const MAX_CONCEPT_PACKETS = 5;
const MAX_CASE_PACKETS = 3;
const MAX_MISCONCEPTIONS = 4;
const MAX_EXAM_PATTERNS = 4;
const MAX_RECENT_STUDY_EPISODES = 4;
const MAX_CONFIRMED_PROFILE_MEMORY = 1;

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const compactWhitespace = (value: string | null | undefined) =>
  normalize(value).replace(/\s+/g, " ");

const textMatches = (
  haystacks: Array<string | null | undefined>,
  needle: string,
) => {
  const normalizedNeedle = compactWhitespace(needle);
  if (!normalizedNeedle) {
    return false;
  }

  return haystacks.some((value) => compactWhitespace(value).includes(normalizedNeedle));
};

const estimateSize = (text: string) => text.length;

const serializeBlock = (title: string, value: unknown) =>
  [title, JSON.stringify(value, null, 2)].join("\n");

const getChecklistIds = (studentState: PromptStudentState | null) =>
  new Set((studentState?.activeChecklist ?? []).map((item) => item.itemId));

const getWeakZoneIds = (studentState: PromptStudentState | null) =>
  new Set((studentState?.weakZones ?? []).map((zone) => zone.zoneId));

const getWeakZoneLabels = (studentState: PromptStudentState | null) =>
  (studentState?.weakZones ?? []).map((zone) => zone.label);

const scoreConceptPacket = ({
  packet,
  currentTurnText,
  weakZoneIds,
  selectedMaterialId,
  checklistIds,
}: {
  packet: PromptCourseBrain["conceptPackets"][number];
  currentTurnText: string;
  weakZoneIds: Set<string>;
  selectedMaterialId: string | null;
  checklistIds: Set<string>;
}) => {
  let score = 0;

  if (
    textMatches(
      [packet.title, packet.summary, ...(packet.keyConcepts ?? [])],
      currentTurnText,
    )
  ) {
    score += 100;
  }
  if (weakZoneIds.has(packet.packetId)) {
    score += 80;
  }
  if (selectedMaterialId && packet.sourceIds?.includes(selectedMaterialId)) {
    score += 60;
  }
  if (checklistIds.has(packet.packetId)) {
    score += 40;
  }
  if (packet.priority === "high") {
    score += 20;
  } else if (packet.priority === "medium") {
    score += 10;
  }

  return score;
};

const scoreCasePacket = ({
  packet,
  currentTurnText,
  selectedMaterialId,
  weakZoneLabels,
}: {
  packet: PromptCourseBrain["casePackets"][number];
  currentTurnText: string;
  selectedMaterialId: string | null;
  weakZoneLabels: string[];
}) => {
  let score = 0;
  if (
    textMatches(
      [
        packet.title,
        packet.summary,
        packet.centralDilemma,
        ...(packet.likelyFrameworks ?? []),
        ...(packet.likelyLegalHooks ?? []),
      ],
      currentTurnText,
    )
  ) {
    score += 100;
  }
  if (selectedMaterialId && packet.sourceIds?.includes(selectedMaterialId)) {
    score += 60;
  }
  if (
    weakZoneLabels.some((label) =>
      textMatches(
        [packet.summary, ...(packet.likelyFrameworks ?? []), ...(packet.likelyLegalHooks ?? [])],
        label,
      ),
    )
  ) {
    score += 80;
  }
  if (packet.priority === "high") {
    score += 20;
  } else if (packet.priority === "medium") {
    score += 10;
  }
  return score;
};

const scoreMisconception = ({
  misconception,
  currentTurnText,
  weakZoneIds,
  checklistIds,
}: {
  misconception: PromptCourseBrain["misconceptions"][number];
  currentTurnText: string;
  weakZoneIds: Set<string>;
  checklistIds: Set<string>;
}) => {
  let score = 0;
  if (textMatches([misconception.label, misconception.correction], currentTurnText)) {
    score += 100;
  }
  if (
    misconception.relatedPacketIds?.some(
      (packetId) => weakZoneIds.has(packetId) || checklistIds.has(packetId),
    )
  ) {
    score += 80;
  }
  return score;
};

const scoreExamPattern = ({
  pattern,
  currentTurnText,
  weakZoneLabels,
}: {
  pattern: PromptCourseBrain["likelyExamPatterns"][number];
  currentTurnText: string;
  weakZoneLabels: string[];
}) => {
  let score = 0;
  if (
    textMatches(
      [pattern.description, ...(pattern.questionTypes ?? []), ...(pattern.targetSkills ?? [])],
      currentTurnText,
    )
  ) {
    score += 100;
  }
  if (
    weakZoneLabels.some((label) =>
      textMatches([pattern.description, ...(pattern.targetSkills ?? [])], label),
    )
  ) {
    score += 80;
  }
  return score;
};

const pruneStudentState = (studentState: PromptStudentState | null) => {
  if (!studentState) {
    return null;
  }

  return {
    ...studentState,
    weakZones: studentState.weakZones.slice(0, MAX_WEAK_ZONES),
    activeChecklist: (studentState.activeChecklist ?? []).slice(0, MAX_CHECKLIST_ITEMS),
  };
};

const pruneCourseBrain = ({
  courseBrain,
  studentState,
  fileContext,
  currentTurnText,
}: {
  courseBrain: PromptCourseBrain;
  studentState: PromptStudentState | null;
  fileContext: FileSessionContext | null;
  currentTurnText: string;
}) => {
  const checklistIds = getChecklistIds(studentState);
  const weakZoneIds = getWeakZoneIds(studentState);
  const weakZoneLabels = getWeakZoneLabels(studentState);
  const selectedMaterialId = fileContext?.materialId ?? null;

  const conceptPackets = [...courseBrain.conceptPackets]
    .sort(
      (left, right) =>
        scoreConceptPacket({
          packet: right,
          currentTurnText,
          weakZoneIds,
          selectedMaterialId,
          checklistIds,
        }) -
        scoreConceptPacket({
          packet: left,
          currentTurnText,
          weakZoneIds,
          selectedMaterialId,
          checklistIds,
        }),
    )
    .slice(0, MAX_CONCEPT_PACKETS);

  const keptConceptIds = new Set(conceptPackets.map((packet) => packet.packetId));

  const casePackets = [...courseBrain.casePackets]
    .sort(
      (left, right) =>
        scoreCasePacket({
          packet: right,
          currentTurnText,
          selectedMaterialId,
          weakZoneLabels,
        }) -
        scoreCasePacket({
          packet: left,
          currentTurnText,
          selectedMaterialId,
          weakZoneLabels,
        }),
    )
    .slice(0, MAX_CASE_PACKETS);

  const misconceptions = [...courseBrain.misconceptions]
    .sort(
      (left, right) =>
        scoreMisconception({
          misconception: right,
          currentTurnText,
          weakZoneIds,
          checklistIds,
        }) -
        scoreMisconception({
          misconception: left,
          currentTurnText,
          weakZoneIds,
          checklistIds,
        }),
    )
    .filter(
      (entry, index) =>
        index < MAX_MISCONCEPTIONS ||
        entry.relatedPacketIds?.some((packetId) => keptConceptIds.has(packetId)),
    )
    .slice(0, MAX_MISCONCEPTIONS);

  const likelyExamPatterns = [...courseBrain.likelyExamPatterns]
    .sort(
      (left, right) =>
        scoreExamPattern({
          pattern: right,
          currentTurnText,
          weakZoneLabels,
        }) -
        scoreExamPattern({
          pattern: left,
          currentTurnText,
          weakZoneLabels,
        }),
    )
    .slice(0, MAX_EXAM_PATTERNS);

  return {
    ...courseBrain,
    conceptPackets,
    casePackets,
    misconceptions,
    likelyExamPatterns,
  };
};

const formatFileContextBlock = (fileContext: FileSessionContext | null) =>
  fileContext ? serializeBlock("Active file context:", fileContext) : null;

const confidenceRank = (value: "high" | "medium" | "low") =>
  value === "high" ? 3 : value === "medium" ? 2 : 1;

const sortByRecencyAndConfidence = <
  Entry extends {
    confidence: "high" | "medium" | "low";
    timestamp: string | null;
  },
>(
  left: Entry,
  right: Entry,
) => {
  const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
  const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return confidenceRank(right.confidence) - confidenceRank(left.confidence);
};

const pruneDerivedMemoryContext = (
  derivedMemoryContext: DerivedMemoryContext | null | undefined,
) => {
  if (!derivedMemoryContext) {
    return null;
  }

  return {
    recentStudyEpisodes: [...derivedMemoryContext.recentStudyEpisodes]
      .sort(sortByRecencyAndConfidence)
      .slice(0, MAX_RECENT_STUDY_EPISODES)
      .map((entry) => ({
        label: entry.label,
        summary: entry.summary,
        trustClass: entry.trustClass,
        confidence: entry.confidence,
        provenance: entry.provenance,
        timestamp: entry.timestamp,
      })),
    confirmedProfileMemory: [...derivedMemoryContext.confirmedProfileMemory]
      .sort(sortByRecencyAndConfidence)
      .slice(0, MAX_CONFIRMED_PROFILE_MEMORY)
      .map((entry) => ({
        label: entry.label,
        summary: entry.summary,
        trustClass: entry.trustClass,
        confidence: entry.confidence,
        provenance: entry.provenance,
        status: entry.status,
        timestamp: entry.timestamp,
      })),
  };
};

const formatDerivedMemoryBlock = (
  derivedMemoryContext: DerivedMemoryContext | null | undefined,
) => {
  const pruned = pruneDerivedMemoryContext(derivedMemoryContext);
  if (!pruned) {
    return null;
  }

  if (
    pruned.recentStudyEpisodes.length === 0 &&
    pruned.confirmedProfileMemory.length === 0
  ) {
    return null;
  }

  return serializeBlock("Derived memory context:", {
    recentStudyMemory: pruned.recentStudyEpisodes,
    confirmedProfileMemory: pruned.confirmedProfileMemory,
    note: "Use this block only for personalization and recent study continuity. Do not treat it as course truth or mastery truth.",
  });
};

const buildMinimalSafePrompt = ({
  routeToolSurfaceBlock,
  validationErrors,
  routeKind,
}: {
  routeToolSurfaceBlock: string;
  validationErrors: string[];
  routeKind: PromptAssemblyInput["routeKind"];
}) => {
  const note =
    validationErrors.length > 0
      ? `Course/state context was unavailable due to validation failure: ${validationErrors.join(" | ")}`
      : "Course/state context was unavailable due to validation failure.";

  return {
    text: [
      BASE_RUNTIME_INSTRUCTIONS,
      "",
      TUTOR_RUNTIME_SHELL_MARKDOWN,
      "",
      TUTOR_RUNTIME_SOUL_MARKDOWN,
      "",
      routeToolSurfaceBlock,
      "",
      note,
    ].join("\n"),
    report: {
      bundleVersion: TUTOR_RUNTIME_SPEC_MANIFEST.bundleVersion,
      bundleHash: TUTOR_RUNTIME_SPEC_MANIFEST.bundleHash,
      routeKind,
      includedSections: ["base", "shell", "soul", "tool_surface", "validation_note"],
      droppedSections: [
        "course_brain",
        "student_state",
        "derived_memory",
        "file_context",
        "prompt_assembly_notes",
        "acceptance_checklist",
      ],
      estimatedSize: 0,
      usedMinimalSafePrompt: true,
      validation: {
        courseBrain: {
          valid: validationErrors.length === 0,
          errors: validationErrors,
        },
        studentState: {
          valid: validationErrors.length === 0,
          errors: validationErrors,
        },
      },
    } satisfies PromptAssemblyReport,
  };
};

const trimToBudget = ({
  promptText,
  droppedSections,
  prunedCourseBrain,
}: {
  promptText: string;
  droppedSections: string[];
  prunedCourseBrain: PromptCourseBrain | null;
}) => {
  if (!prunedCourseBrain || promptText.length <= MAX_PROMPT_CHARACTERS) {
    return { promptText, prunedCourseBrain, droppedSections };
  }

  const reducedCourseBrain: PromptCourseBrain = {
    ...prunedCourseBrain,
    misconceptions: prunedCourseBrain.misconceptions.slice(
      0,
      Math.max(0, prunedCourseBrain.misconceptions.length - 1),
    ),
    likelyExamPatterns: prunedCourseBrain.likelyExamPatterns.slice(
      0,
      Math.max(0, prunedCourseBrain.likelyExamPatterns.length - 1),
    ),
  };

  return {
    promptText,
    prunedCourseBrain: reducedCourseBrain,
    droppedSections: [
      ...droppedSections,
      "extra_misconceptions",
      "extra_exam_patterns",
    ],
  };
};

export const assembleTutorPrompt = ({
  routeKind,
  toolDeclarations,
  promptCourseBrain,
  promptStudentState,
  derivedMemoryContext,
  fileContext,
  currentTurnText,
}: PromptAssemblyInput): PromptAssemblyResult => {
  const toolSurfaceBlock = formatPromptToolSurfaceBlock(toolDeclarations);

  const validatedCourseBrain = promptCourseBrain
    ? validatePromptCourseBrain(promptCourseBrain)
    : { valid: true, data: null, errors: [] };
  const validatedStudentState = promptStudentState
    ? validatePromptStudentState(promptStudentState)
    : { valid: true, data: null, errors: [] };

  if (!validatedCourseBrain.valid || !validatedStudentState.valid) {
    const minimal = buildMinimalSafePrompt({
      routeToolSurfaceBlock: toolSurfaceBlock,
      validationErrors: [
        ...validatedCourseBrain.errors,
        ...validatedStudentState.errors,
      ],
      routeKind,
    });

    minimal.report.estimatedSize = estimateSize(minimal.text);
    minimal.report.validation = {
      courseBrain: {
        valid: validatedCourseBrain.valid,
        errors: validatedCourseBrain.errors,
      },
      studentState: {
        valid: validatedStudentState.valid,
        errors: validatedStudentState.errors,
      },
    };
    return minimal;
  }

  const includedSections = ["base", "shell", "soul", "tool_surface"];
  const droppedSections: string[] = [];
  const normalizedCurrentTurn = currentTurnText ?? "";
  const prunedStudentState = pruneStudentState(validatedStudentState.data);
  const prunedCourseBrain = validatedCourseBrain.data
    ? pruneCourseBrain({
        courseBrain: validatedCourseBrain.data,
        studentState: prunedStudentState,
        fileContext,
        currentTurnText: normalizedCurrentTurn,
      })
    : null;
  const derivedMemoryBlock = formatDerivedMemoryBlock(derivedMemoryContext);
  const fileContextBlock = formatFileContextBlock(fileContext);

  if (prunedCourseBrain) {
    includedSections.push("course_brain");
  } else {
    droppedSections.push("course_brain");
  }

  if (prunedStudentState) {
    includedSections.push("student_state");
  } else {
    droppedSections.push("student_state");
  }

  if (fileContextBlock) {
    includedSections.push("file_context");
  } else {
    droppedSections.push("file_context");
  }

  if (derivedMemoryBlock) {
    includedSections.push("derived_memory");
  } else {
    droppedSections.push("derived_memory");
  }

  const sections = [
    BASE_RUNTIME_INSTRUCTIONS,
    "",
    TUTOR_RUNTIME_SHELL_MARKDOWN,
    "",
    TUTOR_RUNTIME_SOUL_MARKDOWN,
    prunedCourseBrain ? "" : null,
    prunedCourseBrain
      ? serializeBlock("Active course brain:", prunedCourseBrain)
      : null,
    prunedStudentState ? "" : null,
    prunedStudentState
      ? serializeBlock("Active student state:", prunedStudentState)
      : null,
    derivedMemoryBlock ? "" : null,
    derivedMemoryBlock,
    fileContextBlock ? "" : null,
    fileContextBlock,
    "",
    toolSurfaceBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const budgeted = trimToBudget({
    promptText: sections,
    droppedSections,
    prunedCourseBrain,
  });

  const text =
    budgeted.prunedCourseBrain === prunedCourseBrain
      ? sections
      : [
          BASE_RUNTIME_INSTRUCTIONS,
          "",
          TUTOR_RUNTIME_SHELL_MARKDOWN,
          "",
          TUTOR_RUNTIME_SOUL_MARKDOWN,
          budgeted.prunedCourseBrain
            ? serializeBlock("Active course brain:", budgeted.prunedCourseBrain)
            : null,
          prunedStudentState
            ? serializeBlock("Active student state:", prunedStudentState)
            : null,
          derivedMemoryBlock,
          fileContextBlock,
          "",
          toolSurfaceBlock,
        ]
          .filter(Boolean)
          .join("\n");

  return {
    text,
    report: {
      bundleVersion: TUTOR_RUNTIME_SPEC_MANIFEST.bundleVersion,
      bundleHash: TUTOR_RUNTIME_SPEC_MANIFEST.bundleHash,
      routeKind,
      includedSections,
      droppedSections: budgeted.droppedSections,
      estimatedSize: estimateSize(text),
      usedMinimalSafePrompt: false,
      validation: {
        courseBrain: {
          valid: true,
          errors: [],
        },
        studentState: {
          valid: true,
          errors: [],
        },
      },
    },
  };
};

export const TUTOR_RUNTIME_DEBUG_NOTES = {
  promptAssembly: TUTOR_RUNTIME_PROMPT_ASSEMBLY_MARKDOWN,
  acceptanceChecklist: TUTOR_RUNTIME_ACCEPTANCE_CHECKLIST_MARKDOWN,
};
