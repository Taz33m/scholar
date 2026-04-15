import { buildEmptyConceptProgress, getCourseBrainForCourse } from "@/lib/course-brain";
import {
  buildStudentGraphRecommendations,
  buildStudentGraphStats,
  deriveStudentGraphTier,
} from "@/lib/student-access/graph";
import type {
  StudentCourse,
  StudentGraphEdge,
  StudentGraphNode,
  StudentGraphResponse,
} from "@/lib/student-app/types";

function buildNodes(course: StudentCourse): StudentGraphNode[] {
  const courseBrain = getCourseBrainForCourse({
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: course.activeExam?.title ?? null,
  });

  if (!courseBrain) {
    return [];
  }

  return courseBrain.concepts.map((concept) => {
    const progress = buildEmptyConceptProgress(concept);
    const masteryScore = 0;

    return {
      conceptName: concept.label,
      evidenceCount: progress.evidenceCount,
      evidenceSummary: concept.summary,
      id: concept.id,
      lastStudiedAt: progress.lastDemonstratedAt,
      masteryScore,
      masteryTier: deriveStudentGraphTier(masteryScore),
      x: concept.x,
      y: concept.y,
    };
  });
}

export function getCourseFocusTopicFallback(course: Pick<StudentCourse, "slug" | "title">) {
  return (
    getCourseBrainForCourse({
      courseSlug: course.slug,
      courseTitle: course.title,
    })?.focusTopics ?? null
  );
}

export function buildCourseConceptFallbackGraph(
  course: StudentCourse,
): StudentGraphResponse | null {
  const courseBrain = getCourseBrainForCourse({
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: course.activeExam?.title ?? null,
  });

  if (!courseBrain) {
    return null;
  }

  const nodes = buildNodes(course);
  const edges: StudentGraphEdge[] = courseBrain.conceptEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    strength: edge.strength,
    target: edge.target,
  }));

  return {
    course,
    edges,
    lastUpdatedAt: null,
    nodes,
    recommendations: buildStudentGraphRecommendations(nodes),
    stats: buildStudentGraphStats(nodes),
  };
}

export function isMissingStudentGraphRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "PGRST205" ||
    candidate.code === "42P01" ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("student_concept_"))
  );
}
