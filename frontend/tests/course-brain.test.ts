import { describe, expect, it } from "vitest";

import {
  buildCourseBrainPromptPacket,
  buildInitialChecklistItems,
  getCourseBrainForCourse,
  selectCourseBrainConceptIdsForSession,
} from "@/lib/course-brain";

describe("course brain", () => {
  const courseBrain = getCourseBrainForCourse({
    courseSlug: "bel",
    courseTitle: "Business Ethics and Law",
    examTitle: "Exam 2 Review",
  });

  it("resolves the BEL exam 2 course brain", () => {
    expect(courseBrain?.courseTitle).toBe("Business Ethics and Law");
    expect(courseBrain?.concepts).toHaveLength(8);
    expect(courseBrain?.cases.length).toBeGreaterThan(4);
  });

  it("selects session concepts from course focus terms", () => {
    const selected = selectCourseBrainConceptIdsForSession({
      courseBrain: courseBrain!,
      progressSnapshot: [],
      studyContext: {
        courseId: "course-1",
        courseTitle: "Business Ethics and Law",
        courseCode: null,
        examId: "exam-1",
        examTitle: "Exam 2 Review",
        examKind: "midterm",
        examScheduledFor: "2026-04-20T12:00:00.000Z",
        examFocusTopics: ["Advertising claims, puffery, and FTC unfairness"],
        selectedFocusTopics: ["AI ethics, virtual influencers, and algorithmic bias"],
        sessionGoal: "Prepare for Exam 2.",
        focusTopic: "Advertising claims",
      },
    });

    expect(selected).toContain("bel-ftc-advertising");
    expect(selected).toContain("bel-ai-marketing");
  });

  it("builds a 3-4 item initial checklist", () => {
    const items = buildInitialChecklistItems({
      courseBrain: courseBrain!,
      conceptIds: [
        "bel-ftc-advertising",
        "bel-ai-marketing",
        "bel-ai-governance",
      ],
      progressSnapshot: [],
    });

    expect(items).toHaveLength(3);
    expect(items[0]?.status).toBe("in_progress");
    expect(items[0]?.bloomLevel).toBe("understand");
  });

  it("renders a source-backed prompt packet", () => {
    const promptPacket = buildCourseBrainPromptPacket({
      courseId: "course-1",
      courseTitle: "Business Ethics and Law",
      courseCode: null,
      examId: "exam-1",
      examTitle: "Exam 2 Review",
      examKind: "midterm",
      examScheduledFor: "2026-04-20T12:00:00.000Z",
      examFocusTopics: ["Advertising claims, puffery, and FTC unfairness"],
      selectedFocusTopics: ["Advertising claims, puffery, and FTC unfairness"],
      sessionGoal: "Get ready for Exam 2.",
      courseBrainVersionId: "2026-04-13",
      selectedConceptIds: ["bel-ftc-advertising"],
      checklistArtifactId: "checklist-session-1",
      conceptProgressSnapshot: [],
    });

    expect(promptPacket).toContain("Course-only rule");
    expect(promptPacket).toContain("FTC advertising claims, deception, and due care");
    expect(promptPacket).toContain("Likely exam patterns");
  });
});
