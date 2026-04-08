import type { DeepDiveState } from "../types/deepdive";
import type { FlashcardSessionState } from "../types/flashcard";
import type { TutorSession, WorkspaceTabId } from "../types/session";
import type { VisualizationState } from "../types/visualization";
import {
  getSelectedWorksheetArtifact,
  getWorksheetArtifacts,
} from "@/lib/worksheet-state";

export interface WorkspaceTab {
  id: WorkspaceTabId;
  label: string;
  kind: "canvas" | "artifact";
}

interface BuildWorkspaceTabsInput {
  flashcardSession: FlashcardSessionState;
  visualizationState: VisualizationState;
  deepDiveState: DeepDiveState;
  activeSession: TutorSession | null;
}

const hasKeyword = (value: string, keywords: readonly string[]) =>
  keywords.some((keyword) => value.includes(keyword));

const matchesSessionKeyword = (
  activeSession: TutorSession | null,
  keywords: readonly string[],
) => {
  if (!activeSession) return false;

  const byEvent = activeSession.events.some((event) => {
    const toolName = String(event.metadata?.toolName ?? "").toLowerCase();
    return hasKeyword(toolName, keywords);
  });

  const byArtifact = activeSession.artifacts.some((artifact) => {
    const combined = `${artifact.type} ${artifact.title} ${artifact.summary}`.toLowerCase();
    return hasKeyword(combined, keywords);
  });

  return byEvent || byArtifact;
};

const hasArtifactType = (
  activeSession: TutorSession | null,
  type: "google_doc" | "google_sheet" | "quiz" | "worksheet",
) => Boolean(activeSession?.artifacts.some((artifact) => artifact.type === type));

const getUploadedFileArtifacts = (activeSession: TutorSession | null) =>
  activeSession?.artifacts.filter((artifact) => artifact.type === "uploaded_file") ?? [];

export const hasSheetsArtifact = (activeSession: TutorSession | null) =>
  hasArtifactType(activeSession, "google_sheet") ||
  matchesSessionKeyword(activeSession, [
    "google_sheet",
    "google sheet",
    "google sheets",
    "spreadsheet",
    "spreadsheets",
    "excel",
  ]);

export const hasDocsArtifact = (activeSession: TutorSession | null) =>
  hasArtifactType(activeSession, "google_doc") ||
  matchesSessionKeyword(activeSession, [
    "create_google_doc",
    "google_doc",
    "google doc",
    "google docs",
  ]);

export const hasQuizArtifact = (activeSession: TutorSession | null) =>
  hasArtifactType(activeSession, "quiz");

export const hasWorksheetArtifact = (activeSession: TutorSession | null) =>
  hasArtifactType(activeSession, "worksheet");

export const buildWorkspaceTabs = ({
  flashcardSession,
  visualizationState,
  deepDiveState,
  activeSession,
}: BuildWorkspaceTabsInput): WorkspaceTab[] => {
  const next: WorkspaceTab[] = [{ id: "canvas", label: "Canvas", kind: "canvas" }];
  const isFreshFlashcardLandingSession =
    Boolean(activeSession) &&
    activeSession!.artifacts.length === 0 &&
    activeSession!.snapshot.contentView === "flashcards" &&
    activeSession!.snapshot.activeTab === "flashcards";
  const shouldShowFlashcardsTab =
    flashcardSession.mode !== "idle" ||
    flashcardSession.cards.length > 0 ||
    isFreshFlashcardLandingSession;

  if (shouldShowFlashcardsTab) {
    next.push({ id: "flashcards", label: "Flashcards", kind: "artifact" });
  }
  if (visualizationState.mode !== "idle" || Boolean(visualizationState.imageData)) {
    next.push({ id: "visualization", label: "Visualization", kind: "artifact" });
  }
  if (deepDiveState.mode !== "idle" || Boolean(deepDiveState.imageData)) {
    next.push({ id: "deepdive", label: "Deep Dive", kind: "artifact" });
  }
  if (hasSheetsArtifact(activeSession)) {
    next.push({ id: "sheets", label: "Google Sheets", kind: "artifact" });
  }
  if (hasDocsArtifact(activeSession)) {
    next.push({ id: "docs", label: "Google Docs", kind: "artifact" });
  }
  if (hasQuizArtifact(activeSession)) {
    next.push({ id: "quiz", label: "Quiz", kind: "artifact" });
  }
  if (hasWorksheetArtifact(activeSession)) {
    const worksheetArtifacts = getWorksheetArtifacts(activeSession?.artifacts ?? []);
    const selectedWorksheet = getSelectedWorksheetArtifact(
      worksheetArtifacts,
      activeSession?.snapshot.worksheetState,
    );

    next.push({
      id: "worksheet",
      label: selectedWorksheet?.title ?? "Worksheet",
      kind: "artifact",
    });
  }

  const uploadedFiles = getUploadedFileArtifacts(activeSession);
  if (uploadedFiles.length > 0) {
    const selectedUploadedFileId =
      activeSession?.snapshot.uploadedFileState.activeUploadedFileArtifactId ?? null;
    const selectedUploadedFile =
      uploadedFiles.find((artifact) => artifact.id === selectedUploadedFileId) ??
      uploadedFiles[0];

    next.push({
      id: "file",
      label: selectedUploadedFile?.title ?? "File",
      kind: "artifact",
    });
  }

  return next;
};
