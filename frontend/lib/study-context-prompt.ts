import { buildCourseBrainPromptPacket } from "@/lib/course-brain";
import { listOpenableCourseMaterialsForStudyContext } from "@/lib/course-materials";
import type { SessionStudyContext } from "@/types/study-context";

export function buildStudyContextPrompt(
  studyContext: SessionStudyContext | null | undefined,
) {
  if (!studyContext?.courseId) {
    return "No course-backed study context is active.";
  }

  const focusTopics = studyContext.selectedFocusTopics.length
    ? studyContext.selectedFocusTopics.join(", ")
    : studyContext.examFocusTopics.join(", ");
  const courseBrainPacket = buildCourseBrainPromptPacket(studyContext);
  const openableCourseMaterials = listOpenableCourseMaterialsForStudyContext(
    studyContext,
  );

  return [
    "Current study context:",
    `Course: ${studyContext.courseTitle}${studyContext.courseCode ? ` (${studyContext.courseCode})` : ""}`,
    studyContext.examTitle ? `Exam: ${studyContext.examTitle}` : null,
    studyContext.examKind ? `Exam kind: ${studyContext.examKind}` : null,
    studyContext.examScheduledFor
      ? `Scheduled for: ${studyContext.examScheduledFor}`
      : null,
    focusTopics ? `Focus topics: ${focusTopics}` : null,
    studyContext.focusTopic ? `Immediate focus topic: ${studyContext.focusTopic}` : null,
    studyContext.sessionGoal ? `Session goal: ${studyContext.sessionGoal}` : null,
    studyContext.entryPoint ? `Entry point: ${studyContext.entryPoint}` : null,
    studyContext.courseBrainVersionId
      ? `Course brain version: ${studyContext.courseBrainVersionId}`
      : null,
    "",
    "Use this context to keep tutoring and generated artifacts aligned to the upcoming course assessment unless the student explicitly changes scope.",
    openableCourseMaterials.length > 0 ? "" : null,
    openableCourseMaterials.length > 0
      ? "Openable course materials (use open_course_material with the exact materialId when you want the student to review one in the File tab):"
      : null,
    ...openableCourseMaterials.map(
      (material) =>
        `- ${material.materialId}: ${material.title} (${material.kind})`,
    ),
    courseBrainPacket ? "" : null,
    courseBrainPacket,
  ]
    .filter(Boolean)
    .join("\n");
}
