import {
  getCourseBrainForStudyContext,
  selectCourseBrainConceptIdsForSession,
} from "@/lib/course-brain";
import { listOpenableCourseMaterialsForStudyContext } from "@/lib/course-materials";
import type {
  PromptCourseBrain,
  PromptStudentState,
  SessionStatePromptInput,
} from "@/lib/tutor-runtime/types";
import type {
  CourseBrain,
  CourseBrainCase,
  CourseBrainConcept,
  SessionChecklistItem,
  StudentConceptProgress,
} from "@/types/course-brain";

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const splitTerms = (value: string | null | undefined) =>
  normalize(value)
    .split(/[,/]| and /g)
    .map((entry) => entry.trim())
    .filter(Boolean);

const inferPacketPriority = ({
  concept,
  selectedConceptIds,
  focusTerms,
}: {
  concept: CourseBrainConcept;
  selectedConceptIds: string[];
  focusTerms: string[];
}): "high" | "medium" | "low" => {
  if (selectedConceptIds.includes(concept.id)) {
    return "high";
  }

  const haystack = [concept.label, ...concept.focusTags].map(normalize);
  return focusTerms.some((term) => haystack.some((entry) => entry.includes(term)))
    ? "medium"
    : "low";
};

const inferCasePriority = ({
  courseBrain,
  entry,
  selectedConceptIds,
}: {
  courseBrain: CourseBrain;
  entry: CourseBrainCase;
  selectedConceptIds: string[];
}): "high" | "medium" | "low" => {
  if (entry.relatedConceptIds.some((conceptId) => selectedConceptIds.includes(conceptId))) {
    return "high";
  }

  const relatedSelectedConcepts = courseBrain.concepts.filter((concept) =>
    selectedConceptIds.includes(concept.id),
  );

  return relatedSelectedConcepts.some((concept) => concept.caseIds.includes(entry.id))
    ? "medium"
    : "low";
};

const determineCourseMaterialKind = (
  kind: string,
): PromptCourseBrain["openableCourseMaterials"][number]["kind"] => {
  if (kind === "case") {
    return "case_pdf";
  }
  if (kind === "practice_questions") {
    return "practice_questions_pdf";
  }
  if (kind === "syllabus") {
    return "syllabus_pdf";
  }
  if (kind === "lecture") {
    return "lecture_slide_pptx";
  }
  return "other";
};

const getLikelyFrameworks = (concepts: CourseBrainConcept[]) =>
  concepts
    .map((concept) => concept.label)
    .filter((label) =>
      [
        "ethical",
        "csr",
        "esg",
        "ai",
        "advertising",
        "employment",
      ].some((fragment) => normalize(label).includes(fragment)),
    )
    .slice(0, 4);

const getLikelyLegalHooks = (concepts: CourseBrainConcept[]) =>
  concepts
    .map((concept) => concept.label)
    .filter((label) =>
      ["law", "regulator", "osha", "title", "ftc", "eeoc", "ada", "adea"].some(
        (fragment) => normalize(label).includes(fragment),
      ),
    )
    .slice(0, 4);

export const mapInternalCourseBrainToPromptCourseBrain = ({
  studyContext,
  selectedFileMaterialId,
}: {
  studyContext: SessionStatePromptInput["studyContext"];
  selectedFileMaterialId?: string | null;
}): PromptCourseBrain | null => {
  const courseBrain = getCourseBrainForStudyContext(studyContext);
  if (!courseBrain || !studyContext?.courseId) {
    return null;
  }

  const selectedConceptIds =
    studyContext.selectedConceptIds?.length
      ? studyContext.selectedConceptIds
      : selectCourseBrainConceptIdsForSession({
          courseBrain,
          progressSnapshot: studyContext.conceptProgressSnapshot ?? [],
          studyContext,
        });

  const focusTerms = [
    ...studyContext.examFocusTopics.flatMap(splitTerms),
    ...studyContext.selectedFocusTopics.flatMap(splitTerms),
    ...splitTerms(studyContext.focusTopic),
    ...splitTerms(studyContext.sessionGoal),
  ];

  const conceptPackets = courseBrain.concepts.map((concept) => ({
    packetId: concept.id,
    title: concept.label,
    summary: concept.summary,
    keyConcepts: Array.from(new Set([concept.label, ...concept.focusTags])).slice(0, 6),
    sourceIds: concept.sourceIds,
    priority: inferPacketPriority({
      concept,
      selectedConceptIds,
      focusTerms,
    }),
  }));

  const casePackets = courseBrain.cases.map((entry) => {
    const relatedConcepts = courseBrain.concepts.filter((concept) =>
      entry.relatedConceptIds.includes(concept.id),
    );

    return {
      caseId: entry.id,
      title: entry.title,
      summary: entry.summary,
      centralDilemma: entry.ethicalDilemma,
      stakeholders: [],
      likelyFrameworks: getLikelyFrameworks(relatedConcepts),
      likelyLegalHooks: getLikelyLegalHooks(relatedConcepts),
      sourceIds: [entry.sourceId],
      priority:
        selectedFileMaterialId && entry.sourceId === selectedFileMaterialId
          ? "high"
          : inferCasePriority({
              courseBrain,
              entry,
              selectedConceptIds,
            }),
    };
  });

  const misconceptions = courseBrain.misconceptions.map((entry) => ({
    misconceptionId: entry.id,
    label: entry.misconception,
    correction: entry.correction,
    relatedPacketIds: [entry.conceptId],
  }));

  const likelyExamPatterns = courseBrain.questionArchetypes.map((entry) => ({
    patternId: entry.id,
    description: entry.description,
    questionTypes: [entry.format],
    targetSkills: entry.conceptIds
      .map(
        (conceptId) =>
          courseBrain.concepts.find((concept) => concept.id === conceptId)?.label ?? null,
      )
      .filter(Boolean) as string[],
  }));

  const openableCourseMaterials = listOpenableCourseMaterialsForStudyContext(
    studyContext,
  ).map((material) => ({
    materialId: material.materialId,
    courseBrainVersionId: material.courseBrainVersionId,
    title: material.title,
    kind: determineCourseMaterialKind(material.kind),
    mimeType: material.mimeType,
    assetUrl: material.assetUrl ?? undefined,
    openableInSession: material.openableInSession,
    sourceId: material.materialId,
    notes: material.summary,
  }));

  return {
    courseId: studyContext.courseId,
    courseTitle: courseBrain.courseTitle,
    courseVersionId: courseBrain.version,
    examScope: {
      label: courseBrain.examTitle,
      description: courseBrain.scopeSummary,
      includedSourceIds: courseBrain.sourceMaterials
        .filter((entry) => entry.inScope)
        .map((entry) => entry.id),
      excludedSourceIds: courseBrain.sourceMaterials
        .filter((entry) => !entry.inScope)
        .map((entry) => entry.id),
    },
    conceptPackets,
    casePackets,
    misconceptions,
    likelyExamPatterns,
    openableCourseMaterials,
  };
};

const mapWeakZoneStatus = (
  status: StudentConceptProgress["status"],
): PromptStudentState["weakZones"][number]["status"] => {
  if (status === "confident") {
    return "stable";
  }
  if (status === "developing") {
    return "improving";
  }
  if (status === "emerging" || status === "needs_review") {
    return "unstable";
  }
  return "unknown";
};

const mapChecklistStatus = (
  status: SessionChecklistItem["status"],
): NonNullable<PromptStudentState["activeChecklist"]>[number]["status"] => {
  if (status === "completed") {
    return "done";
  }
  if (status === "in_progress" || status === "needs_review") {
    return "in_progress";
  }
  if (status === "not_started") {
    return "not_started";
  }
  return "unknown";
};

const rankWeakZone = (status: PromptStudentState["weakZones"][number]["status"]) => {
  if (status === "unstable") return 0;
  if (status === "unknown") return 1;
  if (status === "improving") return 2;
  return 3;
};

export const mapSessionStateToPromptStudentState = ({
  studentId,
  studyContext,
  fileContext,
  activeChecklistItems,
  progressMeta,
}: SessionStatePromptInput): PromptStudentState | null => {
  if (!studyContext?.courseId) {
    return null;
  }

  const progressSnapshot = studyContext.conceptProgressSnapshot ?? [];
  const weakZones = progressSnapshot
    .map((entry) => ({
      zoneId: entry.conceptId,
      label: entry.conceptName,
      status: mapWeakZoneStatus(entry.status),
      evidenceSource: "unknown" as const,
      notes: entry.evidenceSummary || entry.misconceptionSummary || "",
    }))
    .sort((left, right) => rankWeakZone(left.status) - rankWeakZone(right.status));

  const stableZones = weakZones
    .filter((entry) => entry.status === "stable")
    .map((entry) => entry.label);
  const unstableZones = weakZones
    .filter((entry) => entry.status === "unstable" || entry.status === "unknown")
    .map((entry) => entry.label);

  return {
    studentId: studentId?.trim() || "session-student",
    activeCourseId: studyContext.courseId,
    selectedFile: {
      selectedFileId: fileContext?.artifactId ?? null,
      selectedFileType:
        fileContext?.provenance === "course_material"
          ? "course_material_file"
          : fileContext
            ? "uploaded_file"
            : null,
      selectedFileTitle: fileContext?.title ?? null,
      selectedFileProvenance:
        fileContext?.provenance === "course_material"
          ? "course_material"
          : fileContext
            ? "uploaded"
            : null,
      materialId: fileContext?.materialId ?? null,
      activeFileContextAvailable: Boolean(fileContext),
    },
    weakZones,
    progressSnapshot: {
      isAuthoritative: Boolean(progressMeta?.isAuthoritative),
      lastAuthoritativeUpdateAt: progressMeta?.lastAuthoritativeUpdateAt ?? null,
      source: progressMeta?.source ?? null,
      topPointLossRisks: unstableZones.slice(0, 3),
      stableZones: stableZones.slice(0, 4),
      unstableZones: unstableZones.slice(0, 4),
    },
    activeChecklist: (activeChecklistItems ?? []).map((item) => ({
      itemId: item.conceptId,
      label: item.label,
      status: mapChecklistStatus(item.status),
    })),
  };
};
