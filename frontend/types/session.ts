import type { FlashcardSessionState } from "@/types/flashcard";
import type { VisualizationState } from "@/types/visualization";
import type { DeepDiveState } from "@/types/deepdive";

export type ContentView = "flashcards" | "visualization" | "deepdive";
export type WorkspaceTabId =
  | "canvas"
  | "flashcards"
  | "visualization"
  | "deepdive"
  | "sheets"
  | "docs"
  | "quiz";

export type SessionEventType =
  | "session_started"
  | "session_ended"
  | "tool_called"
  | "tool_result"
  | "artifact_created"
  | "view_changed"
  | "note";

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: Date;
  text: string;
  metadata?: Record<string, unknown>;
}

export type SessionArtifactType =
  | "flashcard_deck"
  | "visualization_image"
  | "deep_dive_bundle"
  | "google_doc"
  | "google_sheet"
  | "quiz";

interface SessionArtifactBase {
  id: string;
  type: SessionArtifactType;
  title: string;
  createdAt: Date;
  summary: string;
}

export interface FlashcardDeckArtifact extends SessionArtifactBase {
  type: "flashcard_deck";
  cardCount: number;
}

export interface VisualizationArtifact extends SessionArtifactBase {
  type: "visualization_image";
  description: string;
  imageData: string;
}

export interface DeepDiveArtifact extends SessionArtifactBase {
  type: "deep_dive_bundle";
  topic: string;
  overviewText: string;
  imageData: string;
}

export interface GoogleDocSection {
  heading: string;
  content: string;
  bullets: string[];
}

export interface GoogleDocArtifact extends SessionArtifactBase {
  type: "google_doc";
  sections: GoogleDocSection[];
}

export interface GoogleSheetTab {
  name: string;
  columns: string[];
  rows: string[][];
}

export interface GoogleSheetArtifact extends SessionArtifactBase {
  type: "google_sheet";
  sheets: GoogleSheetTab[];
}

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizArtifact extends SessionArtifactBase {
  type: "quiz";
  questions: QuizQuestion[];
}

export interface QuizQuestionContext extends QuizQuestion {
  index: number;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
}

export interface QuizSessionContext {
  title: string;
  summary: string;
  isSubmitted: boolean;
  answeredCount: number;
  totalQuestions: number;
  score: number | null;
  questions: QuizQuestionContext[];
}

export interface QuizSnapshotState {
  selections: Record<number, string>;
  isSubmitted: boolean;
}

export type SessionArtifact =
  | FlashcardDeckArtifact
  | VisualizationArtifact
  | DeepDiveArtifact
  | GoogleDocArtifact
  | GoogleSheetArtifact
  | QuizArtifact;

export interface SessionSnapshot {
  contentView: ContentView;
  activeTab: WorkspaceTabId;
  flashcardSession: FlashcardSessionState;
  visualizationState: VisualizationState;
  deepDiveState: DeepDiveState;
  quizState: QuizSnapshotState;
}

export interface TutorSession {
  id: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  events: SessionEvent[];
  artifacts: SessionArtifact[];
  snapshot: SessionSnapshot;
}
