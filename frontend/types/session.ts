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
  | "quiz"
  | "worksheet"
  | "file";

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

export interface SessionTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
}

export type SessionArtifactType =
  | "flashcard_deck"
  | "visualization_image"
  | "deep_dive_bundle"
  | "google_doc"
  | "google_sheet"
  | "quiz"
  | "worksheet"
  | "uploaded_file";

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

export type WorksheetDifficulty = "easy" | "medium" | "hard";

export interface WorksheetChoiceOption {
  id: string;
  label: string;
  text: string;
}

interface WorksheetItemBase {
  questionId: string;
  prompt: string;
}

export interface WorksheetMultipleChoiceItem extends WorksheetItemBase {
  kind: "multiple_choice";
  choices: WorksheetChoiceOption[];
}

export interface WorksheetMultiSelectItem extends WorksheetItemBase {
  kind: "multi_select";
  choices: WorksheetChoiceOption[];
}

export interface WorksheetShortAnswerItem extends WorksheetItemBase {
  kind: "short_answer";
  placeholder: string | null;
  lineCount: number;
}

export type WorksheetItem =
  | WorksheetMultipleChoiceItem
  | WorksheetMultiSelectItem
  | WorksheetShortAnswerItem;

export interface WorksheetSection {
  id: string;
  heading: string;
  directions: string | null;
  items: WorksheetItem[];
}

export interface WorksheetDocument {
  subtitle: string | null;
  learningObjectives: string[];
  sections: WorksheetSection[];
}

export interface WorksheetAnswerKeyEntry {
  questionId: string;
  answerText: string;
  explanation: string;
}

export interface WorksheetArtifact extends SessionArtifactBase {
  type: "worksheet";
  instructions: string;
  estimatedTimeMinutes: number | null;
  difficulty: WorksheetDifficulty | null;
  document: WorksheetDocument;
  answerKey: WorksheetAnswerKeyEntry[];
}

export interface UploadedFileArtifact extends SessionArtifactBase {
  type: "uploaded_file";
  fileName: string;
  mimeType: string;
  storageKey: string;
  extractedText: string | null;
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

interface WorksheetResponseBase {
  note: string;
}

export interface WorksheetMultipleChoiceResponse extends WorksheetResponseBase {
  kind: "multiple_choice";
  selectedOptionId: string | null;
}

export interface WorksheetMultiSelectResponse extends WorksheetResponseBase {
  kind: "multi_select";
  selectedOptionIds: string[];
}

export interface WorksheetShortAnswerResponse extends WorksheetResponseBase {
  kind: "short_answer";
  answerText: string;
}

export type WorksheetResponse =
  | WorksheetMultipleChoiceResponse
  | WorksheetMultiSelectResponse
  | WorksheetShortAnswerResponse;

export type WorksheetItemContext = WorksheetItem & {
  response: WorksheetResponse | null;
  answerKey: WorksheetAnswerKeyEntry | null;
};

export interface WorksheetSectionContext {
  id: string;
  heading: string;
  directions: string | null;
  items: WorksheetItemContext[];
}

export interface WorksheetSessionContext {
  worksheetId: string;
  title: string;
  summary: string;
  instructions: string;
  estimatedTimeMinutes: number | null;
  difficulty: WorksheetDifficulty | null;
  answeredCount: number;
  totalQuestions: number;
  sections: WorksheetSectionContext[];
  answerKey: WorksheetAnswerKeyEntry[];
}

export interface UploadedFileSessionContext {
  artifactId: string;
  title: string;
  summary: string;
  fileName: string;
  mimeType: string;
  extractedText: string | null;
}

export interface QuizSnapshotState {
  selections: Record<number, string>;
  isSubmitted: boolean;
}

export interface WorksheetSnapshotState {
  activeWorksheetArtifactId: string | null;
  responsesByArtifactId: Record<string, Record<string, WorksheetResponse>>;
}

export interface UploadedFileSnapshotState {
  activeUploadedFileArtifactId: string | null;
}

export type SessionArtifact =
  | FlashcardDeckArtifact
  | VisualizationArtifact
  | DeepDiveArtifact
  | GoogleDocArtifact
  | GoogleSheetArtifact
  | QuizArtifact
  | WorksheetArtifact
  | UploadedFileArtifact;

export interface SessionSnapshot {
  contentView: ContentView;
  activeTab: WorkspaceTabId;
  flashcardSession: FlashcardSessionState;
  visualizationState: VisualizationState;
  deepDiveState: DeepDiveState;
  quizState: QuizSnapshotState;
  worksheetState: WorksheetSnapshotState;
  uploadedFileState: UploadedFileSnapshotState;
  transcript: SessionTranscriptEntry[];
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
