import { describe, expect, it } from "vitest";

import {
  buildCourseConceptFallbackGraph,
  getCourseFocusTopicFallback,
  isMissingStudentGraphRelationError,
} from "@/lib/student-access/course-concepts";

describe("student course concepts", () => {
  const belCourse = {
    activeExam: null,
    colorToken: "amber",
    courseCode: null,
    description: "Business Ethics and Law exam prep.",
    id: "course-bel",
    lastActivityAt: null,
    meetingPattern: null,
    onboarding: null,
    onboardingStatus: "not_started" as const,
    sessionCount: 0,
    slug: "bel",
    termLabel: "Spring 2026",
    timeZone: "America/New_York",
    title: "Business Ethics and Law",
  };

  it("returns the real BEL focus topic set", () => {
    expect(getCourseFocusTopicFallback(belCourse)).toEqual([
      "Ethical frameworks and case-based reasoning",
      "U.S. business law foundations and regulators",
      "Employment discrimination and worker protections",
      "Advertising claims, puffery, and FTC unfairness",
      "CSR, ESG, and greenwashing",
      "AI ethics, virtual influencers, and algorithmic bias",
    ]);
  });

  it("builds a non-empty BEL concept graph fallback", () => {
    const graph = buildCourseConceptFallbackGraph(belCourse);

    expect(graph).not.toBeNull();
    expect(graph?.nodes).toHaveLength(8);
    expect(graph?.edges.length).toBeGreaterThan(0);
    expect(graph?.nodes.every((node) => node.masteryScore === 0)).toBe(true);
    expect(graph?.stats.conceptCount).toBe(8);
  });

  it("ignores unrelated courses", () => {
    expect(
      buildCourseConceptFallbackGraph({
        ...belCourse,
        slug: "marketing",
        title: "Marketing Principles",
      }),
    ).toBeNull();
  });

  it("detects missing graph relation errors", () => {
    expect(isMissingStudentGraphRelationError({ code: "PGRST205" })).toBe(true);
    expect(
      isMissingStudentGraphRelationError({
        message: "Could not find relation public.student_concept_nodes",
      }),
    ).toBe(true);
    expect(isMissingStudentGraphRelationError({ code: "42501" })).toBe(false);
  });
});
