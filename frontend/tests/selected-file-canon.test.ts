import { describe, expect, it } from "vitest";

import { mapInternalCourseBrainToPromptCourseBrain, mapSessionStateToPromptStudentState } from "@/lib/tutor-runtime/adapters";
import { assembleTutorPrompt } from "@/lib/tutor-runtime/assemble";
import {
  buildFileContextFromSelectedArtifact,
  resolveCanonicalSelectedFile,
  resolveCanonicalSelectedFileArtifact,
} from "@/lib/tutor-runtime/file-context";
import type {
  CourseMaterialFileArtifact,
  FileArtifact,
  FileSnapshotState,
  UploadedFileArtifact,
} from "@/types/session";
import type { SessionStudyContext } from "@/types/study-context";

const NOW = new Date("2026-04-14T12:00:00.000Z");

const BEL_STUDY_CONTEXT: SessionStudyContext = {
  courseId: "course-bel",
  courseTitle: "Business Ethics and Law",
  courseCode: null,
  examId: "exam-bel-2",
  examTitle: "Exam 2 Review",
  examKind: "midterm",
  examScheduledFor: "2026-04-20T08:00:00.000Z",
  examFocusTopics: ["Ethical frameworks and case-based reasoning"],
  selectedFocusTopics: [],
  sessionGoal: "Hit full recall on the core cases.",
  courseBrainVersionId: "2026-04-13",
  selectedConceptIds: ["bel-ethical-frameworks"],
  checklistArtifactId: "checklist-1",
  conceptProgressSnapshot: [],
  entryPoint: "course_home",
  focusTopic: "Danone",
};

const uploadedOne: UploadedFileArtifact = {
  id: "upload-1",
  type: "uploaded_file",
  title: "Student Notes",
  createdAt: NOW,
  summary: "Uploaded note packet.",
  fileName: "notes.pdf",
  mimeType: "application/pdf",
  extractedText: "Student notes on ESG.",
  storageKey: "upload-1",
  provenance: "upload",
};

const courseMaterial: CourseMaterialFileArtifact = {
  id: "material-1",
  type: "course_material_file",
  title: "Danone: Redefining Corporate Responsibility",
  createdAt: NOW,
  summary: "CSR case packet.",
  fileName: "danone.pdf",
  mimeType: "application/pdf",
  extractedText: "Core dilemma: stakeholder capitalism at scale.",
  materialId: "bel-danone",
  sourceKind: "case",
  courseBrainVersionId: "2026-04-13",
  assetUrl: "/course-materials/bel/danone.pdf",
  provenance: "course_material",
};

const uploadedTwo: UploadedFileArtifact = {
  id: "upload-2",
  type: "uploaded_file",
  title: "Practice Packet",
  createdAt: NOW,
  summary: "Uploaded practice questions.",
  fileName: "practice.pdf",
  mimeType: "application/pdf",
  extractedText: "Practice questions on advertising and FTC deception.",
  storageKey: "upload-2",
  provenance: "upload",
};

const fileArtifacts: FileArtifact[] = [uploadedOne, courseMaterial, uploadedTwo];

describe("selected-file canon", () => {
  it("keeps the resolver, file context, and prompt student state aligned across file switches", () => {
    const promptCourseBrain = mapInternalCourseBrainToPromptCourseBrain({
      studyContext: BEL_STUDY_CONTEXT,
    });

    const scenarios: Array<{
      fileState: FileSnapshotState;
      expectedId: string;
      expectedTitle: string;
      expectedType: "uploaded_file" | "course_material_file";
      expectedMaterialId: string | null;
    }> = [
      {
        fileState: { activeFileArtifactId: uploadedOne.id },
        expectedId: uploadedOne.id,
        expectedTitle: uploadedOne.title,
        expectedType: "uploaded_file",
        expectedMaterialId: null,
      },
      {
        fileState: { activeFileArtifactId: courseMaterial.id },
        expectedId: courseMaterial.id,
        expectedTitle: courseMaterial.title,
        expectedType: "course_material_file",
        expectedMaterialId: "bel-danone",
      },
      {
        fileState: { activeFileArtifactId: uploadedTwo.id },
        expectedId: uploadedTwo.id,
        expectedTitle: uploadedTwo.title,
        expectedType: "uploaded_file",
        expectedMaterialId: null,
      },
    ];

    scenarios.forEach((scenario) => {
      const selectedRef = resolveCanonicalSelectedFile({
        fileArtifacts,
        fileState: scenario.fileState,
      });
      const selectedArtifact = resolveCanonicalSelectedFileArtifact({
        fileArtifacts,
        fileState: scenario.fileState,
      });
      const fileContext = buildFileContextFromSelectedArtifact(selectedArtifact);
      const promptStudentState = mapSessionStateToPromptStudentState({
        studyContext: BEL_STUDY_CONTEXT,
        fileContext,
        activeChecklistItems: [],
      });
      const assembled = assembleTutorPrompt({
        routeKind: "text_tutor",
        toolDeclarations: [],
        promptCourseBrain,
        promptStudentState,
        fileContext,
        currentTurnText: "Use the selected file.",
      });

      expect(selectedRef?.selectedFileId).toBe(scenario.expectedId);
      expect(selectedRef?.selectedFileType).toBe(scenario.expectedType);
      expect(selectedArtifact?.id).toBe(scenario.expectedId);
      expect(fileContext?.artifactId).toBe(scenario.expectedId);
      expect(promptStudentState?.selectedFile.selectedFileId).toBe(scenario.expectedId);
      expect(promptStudentState?.selectedFile.selectedFileType).toBe(
        scenario.expectedType,
      );
      expect(promptStudentState?.selectedFile.materialId).toBe(
        scenario.expectedMaterialId,
      );
      expect(assembled.text).toContain(`"selectedFileId": "${scenario.expectedId}"`);
      expect(assembled.text).toContain(`"title": "${scenario.expectedTitle}"`);
    });
  });
});
