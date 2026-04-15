import { describe, expect, it } from "vitest";

import {
  buildInitialChecklistItems,
  createSessionChecklistArtifact,
  getCourseBrainForCourse,
  mergeProgressSnapshots,
  selectCourseBrainConceptIdsForSession,
} from "@/lib/course-brain";
import { evaluateSessionProgress } from "@/lib/course-brain/progress";
import type { SessionStudyContext } from "@/types/study-context";
import type { StudentConceptProgress } from "@/types/course-brain";

function buildStudyContext(): SessionStudyContext {
  return {
    courseId: "course-bel-1",
    courseTitle: "Business Ethics and Law",
    courseCode: null,
    examId: "exam-bel-2",
    examTitle: "Exam 2 Review",
    examKind: "midterm",
    examScheduledFor: "2026-04-20T12:00:00.000Z",
    examFocusTopics: [],
    selectedFocusTopics: [],
    sessionGoal: "Reach full mastery across all Business Ethics and Law Exam 2 concepts.",
    focusTopic: null,
  };
}

function runHighPerformanceSession(input: {
  sessionIndex: number;
  progressSnapshot: StudentConceptProgress[];
}) {
  const { progressSnapshot, sessionIndex } = input;
  const courseBrain = getCourseBrainForCourse({
    courseSlug: "bel",
    courseTitle: "Business Ethics and Law",
    examTitle: "Exam 2 Review",
  });

  if (!courseBrain) {
    throw new Error("Expected the BEL course brain to be available.");
  }

  const studyContext = buildStudyContext();
  const selectedConceptIds = selectCourseBrainConceptIdsForSession({
    courseBrain,
    progressSnapshot,
    studyContext,
  });

  let checklistArtifact = createSessionChecklistArtifact({
    checklistArtifactId: `checklist-session-${sessionIndex}`,
    courseBrain,
    createdAt: new Date(`2026-04-${String(10 + sessionIndex).padStart(2, "0")}T13:00:00.000Z`),
    items: buildInitialChecklistItems({
      courseBrain,
      conceptIds: selectedConceptIds,
      progressSnapshot,
    }),
  });

  let mergedProgress = progressSnapshot;

  checklistArtifact.items.forEach((item, itemIndex) => {
    const result = evaluateSessionProgress({
      courseBrain,
      checklistArtifact,
      existingProgressSnapshot: mergedProgress,
      trigger: "quiz_submission",
      quiz: {
        isSubmitted: true,
        score: 5,
        totalQuestions: 5,
      },
      worksheet: {
        answeredCount: itemIndex + 1,
        totalQuestions: checklistArtifact.items.length,
      },
      transcriptText:
        "Student explains the governing rule, works through the facts carefully, compares ethical frameworks, and defends the conclusion using course language from lecture and the assigned cases.",
      sessionSummary:
        "The student showed precise recall, clear explanation, and strong case-based reasoning throughout the checkpoint.",
      evaluatedAt: `2026-04-${String(10 + sessionIndex).padStart(2, "0")}T13:${String(
        itemIndex,
      ).padStart(2, "0")}:00.000Z`,
    });

    checklistArtifact = result.checklistArtifact;
    mergedProgress = mergeProgressSnapshots(
      mergedProgress,
      result.conceptProgressSnapshot,
    );
  });

  const exitResult = evaluateSessionProgress({
    courseBrain,
    checklistArtifact,
    existingProgressSnapshot: mergedProgress,
    trigger: "session_exit",
    quiz: {
      isSubmitted: true,
      score: 5,
      totalQuestions: 5,
    },
    worksheet: {
      answeredCount: checklistArtifact.items.length,
      totalQuestions: checklistArtifact.items.length,
    },
    transcriptText:
      "Student sustained a detailed explanation of the legal and ethical issues, justified the best answer in course terms, and corrected earlier misconceptions while closing the session.",
    sessionSummary:
      "The session closed with accurate application and defense of the exam concepts practiced today.",
    evaluatedAt: `2026-04-${String(10 + sessionIndex).padStart(2, "0")}T14:00:00.000Z`,
  });

  return {
    selectedConceptIds,
    checklistArtifact: exitResult.checklistArtifact,
    progressSnapshot: mergeProgressSnapshots(
      mergedProgress,
      exitResult.conceptProgressSnapshot,
    ),
    nextRecommendedConceptIds: exitResult.nextRecommendedConceptIds,
  };
}

describe("Business Ethics and Law mastery smoke", () => {
  it("can drive all Exam 2 concepts to confident with repeated strong sessions", () => {
    const courseBrain = getCourseBrainForCourse({
      courseSlug: "bel",
      courseTitle: "Business Ethics and Law",
      examTitle: "Exam 2 Review",
    });

    expect(courseBrain).not.toBeNull();

    let progressSnapshot: StudentConceptProgress[] = [];
    const selectedHistory: string[][] = [];

    for (let sessionIndex = 1; sessionIndex <= 6; sessionIndex += 1) {
      const result = runHighPerformanceSession({
        sessionIndex,
        progressSnapshot,
      });

      selectedHistory.push(result.selectedConceptIds);
      progressSnapshot = result.progressSnapshot;
    }

    expect(progressSnapshot).toHaveLength(courseBrain!.concepts.length);
    expect(new Set(progressSnapshot.map((entry) => entry.conceptId)).size).toBe(
      courseBrain!.concepts.length,
    );
    expect(
      progressSnapshot.every(
        (entry) =>
          entry.status === "confident" &&
          entry.highestDemonstratedBloomLevel === "analyze" &&
          entry.confidenceSignal >= 0.85,
      ),
    ).toBe(true);

    expect(selectedHistory[0]).toHaveLength(4);
    expect(selectedHistory[1]).toHaveLength(4);
    expect(new Set([...selectedHistory[0], ...selectedHistory[1]]).size).toBe(8);
  });
});
