import type {
  SessionArtifact,
  WorksheetAnswerKeyEntry,
  WorksheetArtifact,
  WorksheetDocument,
  WorksheetItem,
  WorksheetResponse,
  WorksheetSection,
  WorksheetSessionContext,
  WorksheetSnapshotState,
} from "@/types/session";

export const getWorksheetArtifacts = (
  artifacts: SessionArtifact[],
): WorksheetArtifact[] =>
  artifacts.filter(
    (artifact): artifact is WorksheetArtifact => artifact.type === "worksheet",
  );

export const getSelectedWorksheetArtifact = (
  artifacts: WorksheetArtifact[],
  worksheetState: WorksheetSnapshotState | null | undefined,
): WorksheetArtifact | null => {
  if (artifacts.length === 0) {
    return null;
  }

  const activeId = worksheetState?.activeWorksheetArtifactId;
  if (activeId) {
    const selected = artifacts.find((artifact) => artifact.id === activeId);
    if (selected) {
      return selected;
    }
  }

  return artifacts[0] ?? null;
};

export const getWorksheetResponses = (
  worksheetState: WorksheetSnapshotState | null | undefined,
  artifactId: string | null | undefined,
): Record<string, WorksheetResponse> => {
  if (!worksheetState || !artifactId) {
    return {};
  }

  return worksheetState.responsesByArtifactId[artifactId] ?? {};
};

export const flattenWorksheetItems = (
  document: WorksheetDocument,
): Array<WorksheetItem & { section: WorksheetSection; questionNumber: number }> => {
  let questionNumber = 0;

  return document.sections.flatMap((section) =>
    section.items.map((item) => {
      questionNumber += 1;
      return {
        ...item,
        section,
        questionNumber,
      };
    }),
  );
};

export const isWorksheetResponseAnswered = (
  response: WorksheetResponse | null | undefined,
): boolean => {
  if (!response) {
    return false;
  }

  if (response.kind === "multiple_choice") {
    return Boolean(response.selectedOptionId);
  }

  if (response.kind === "multi_select") {
    return response.selectedOptionIds.length > 0;
  }

  return response.answerText.trim().length > 0;
};

export const countWorksheetItems = (artifact: WorksheetArtifact): number =>
  artifact.document.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  );

export const countAnsweredWorksheetItems = (
  artifact: WorksheetArtifact,
  responses: Record<string, WorksheetResponse>,
): number =>
  artifact.document.sections.reduce((count, section) => {
    return (
      count +
      section.items.reduce(
        (sectionCount, item) =>
          sectionCount +
          (isWorksheetResponseAnswered(responses[item.questionId]) ? 1 : 0),
        0,
      )
    );
  }, 0);

export const getWorksheetAnswerKeyEntry = (
  artifact: WorksheetArtifact,
  questionId: string,
): WorksheetAnswerKeyEntry | null =>
  artifact.answerKey.find((entry) => entry.questionId === questionId) ?? null;

export const buildWorksheetContext = (
  artifact: WorksheetArtifact | null,
  responses: Record<string, WorksheetResponse>,
): WorksheetSessionContext | null => {
  if (!artifact) {
    return null;
  }

  const totalQuestions = countWorksheetItems(artifact);
  const answeredCount = countAnsweredWorksheetItems(artifact, responses);

  return {
    worksheetId: artifact.id,
    title: artifact.title,
    summary: artifact.summary,
    instructions: artifact.instructions,
    estimatedTimeMinutes: artifact.estimatedTimeMinutes,
    difficulty: artifact.difficulty,
    answeredCount,
    totalQuestions,
    sections: artifact.document.sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      directions: section.directions,
      items: section.items.map((item) => ({
        ...item,
        response: responses[item.questionId] ?? null,
        answerKey: getWorksheetAnswerKeyEntry(artifact, item.questionId),
      })),
    })),
    answerKey: artifact.answerKey,
  };
};
