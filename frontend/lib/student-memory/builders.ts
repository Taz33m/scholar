import type { CourseBrain, StudentConceptProgress } from "@/types/course-brain";
import type { CourseMaterialFileArtifact } from "@/types/session";
import type {
  ProfileSignalCandidate,
  StudyEpisodeMemoryRecord,
  StudentProfileMemoryRecord,
} from "@/types/student-memory";
import type { SessionProgressTrigger } from "@/lib/course-brain/progress";
import { buildProfileSignalCandidates } from "@/lib/student-memory/profile-signals";
import { redactStudentMemoryText } from "@/lib/student-memory/redaction";

const provenanceByTrigger: Record<
  SessionProgressTrigger,
  StudyEpisodeMemoryRecord["provenance"]
> = {
  quiz_submission: "authoritative_quiz_result",
  worksheet_checkpoint: "authoritative_worksheet_checkpoint",
  session_exit: "authoritative_session_exit",
};

const uniqueStrings = (values: string[]) =>
  values.filter((value, index) => values.indexOf(value) === index);

export const buildStudyEpisodeMemory = ({
  courseBrain,
  createdAt,
  evaluation,
  externalSessionId,
  materialsTouched,
  studentId,
  courseId,
  examId,
  trigger,
}: {
  courseBrain: CourseBrain;
  createdAt: string;
  evaluation: {
    conceptProgressSnapshot: StudentConceptProgress[];
    misconceptionsFound: string[];
    nextRecommendedConceptIds: string[];
  };
  externalSessionId: string;
  materialsTouched: Array<Pick<CourseMaterialFileArtifact, "materialId" | "title" | "sourceKind">>;
  studentId: string;
  courseId: string;
  examId: string | null;
  trigger: SessionProgressTrigger;
}): StudyEpisodeMemoryRecord => {
  const focusConceptIds = uniqueStrings(
    evaluation.conceptProgressSnapshot.map((entry) => entry.conceptId),
  ).slice(0, 6);
  const focusConceptLabels = uniqueStrings(
    evaluation.conceptProgressSnapshot.map((entry) => entry.conceptName),
  ).slice(0, 6);
  const unstableZones = evaluation.conceptProgressSnapshot
    .filter((entry) => entry.status === "needs_review" || entry.status === "emerging")
    .map((entry) => entry.conceptName)
    .slice(0, 4);
  const stableZones = evaluation.conceptProgressSnapshot
    .filter((entry) => entry.status === "developing" || entry.status === "confident")
    .map((entry) => entry.conceptName)
    .slice(0, 4);
  const topPointLossRisks = uniqueStrings([
    ...unstableZones,
    ...evaluation.misconceptionsFound,
  ]).slice(0, 4);
  const recommendedNextDrills = evaluation.nextRecommendedConceptIds
    .map(
      (conceptId) =>
        courseBrain.concepts.find((entry) => entry.id === conceptId)?.label ?? null,
    )
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4)
    .map((label) => `Review ${label} with a timed course-style prompt.`);
  const summaryParts = [
    topPointLossRisks.length > 0
      ? `Main point-loss risks: ${topPointLossRisks.join(", ")}.`
      : null,
    stableZones.length > 0 ? `Stable zones: ${stableZones.join(", ")}.` : null,
    recommendedNextDrills.length > 0
      ? `Next drills: ${recommendedNextDrills.join(" ")}`
      : null,
  ].filter(Boolean);

  return {
    memoryType: "study_episode",
    studentId,
    courseId,
    examId,
    externalSessionId,
    trigger,
    focusConceptIds,
    focusConceptLabels,
    materialsTouched: materialsTouched.map((material) => ({
      materialId: material.materialId,
      title: material.title,
      kind: material.sourceKind,
    })),
    topPointLossRisks: topPointLossRisks.map(redactStudentMemoryText).filter(Boolean),
    stableZones: stableZones.map(redactStudentMemoryText).filter(Boolean),
    unstableZones: unstableZones.map(redactStudentMemoryText).filter(Boolean),
    misconceptionsRemaining: evaluation.misconceptionsFound
      .map(redactStudentMemoryText)
      .filter(Boolean)
      .slice(0, 4),
    recommendedNextDrills: recommendedNextDrills
      .map(redactStudentMemoryText)
      .filter(Boolean),
    summary:
      redactStudentMemoryText(summaryParts.join(" ")) ||
      "Reviewed the current course objectives and recorded the highest-risk concepts for the next study block.",
    trustClass: "authoritative_derived",
    confidence: "high",
    provenance: provenanceByTrigger[trigger],
    createdAt,
  };
};

export const buildProfileSignalCandidatesFromEpisode = ({
  createdAt,
  episode,
  sessionGoal,
}: {
  createdAt: string;
  episode: StudyEpisodeMemoryRecord;
  sessionGoal: string;
}): ProfileSignalCandidate[] =>
  buildProfileSignalCandidates({
    createdAt,
    materialsTouched: episode.materialsTouched,
    sessionGoal,
    sourceSessionId: episode.externalSessionId,
    unstableZones: episode.unstableZones,
  });

export const buildConfirmedProfileMemoryRecord = ({
  confidence,
  lastConfirmedAt,
  profileKey,
  sourceSessionIds,
  status = "confirmed",
  studentId,
  summary,
  trustClass,
}: {
  confidence: StudentProfileMemoryRecord["confidence"];
  lastConfirmedAt: string | null;
  profileKey: string;
  sourceSessionIds: string[];
  status?: StudentProfileMemoryRecord["status"];
  studentId: string;
  summary: string;
  trustClass: StudentProfileMemoryRecord["trustClass"];
}): StudentProfileMemoryRecord => ({
  memoryType: "student_profile",
  studentId,
  profileKey,
  summary: redactStudentMemoryText(summary),
  trustClass,
  confidence,
  provenance: "derived_profile_update",
  status,
  lastConfirmedAt,
  sourceSessionIds,
});

export const buildStudentMemorySearchQuery = (input: {
  courseTitle: string;
  examTitle: string | null;
  focusTopic: string | null;
  sessionGoal: string;
  selectedConceptIds: string[];
  selectedFocusTopics: string[];
}) =>
  [
    input.courseTitle,
    input.examTitle,
    input.focusTopic,
    input.sessionGoal,
    ...input.selectedFocusTopics,
    ...input.selectedConceptIds,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
