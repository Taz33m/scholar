import { getCourseBrainForStudyContext } from "@/lib/course-brain";
import type {
  CourseBrain,
  CourseBrainConcept,
  CourseBrainSourceKind,
  CourseBrainSourceMaterial,
} from "@/types/course-brain";
import type { SessionStudyContext } from "@/types/study-context";

export interface CourseMaterialReference {
  materialId: string;
  courseBrainVersionId: string;
  title: string;
  kind: CourseBrainSourceKind;
  mimeType: string;
  fileName: string;
  assetUrl: string | null;
  openableInSession: boolean;
  summary: string;
  extractedText: string | null;
  fallbackMaterialId: string | null;
}

interface OpenableCourseMaterialAsset {
  assetUrl: string;
  fileName: string;
  mimeType: string;
}

const OPENABLE_COURSE_MATERIAL_ASSETS: Record<
  string,
  OpenableCourseMaterialAsset
> = {
  "bel-syllabus": {
    assetUrl: "/course-materials/bel/ethics-syllabus.pdf",
    fileName: "ethics-syllabus.pdf",
    mimeType: "application/pdf",
  },
  "bel-practice-questions": {
    assetUrl: "/course-materials/bel/practice-questions.pdf",
    fileName: "practice-questions.pdf",
    mimeType: "application/pdf",
  },
  "bel-employment-vignettes": {
    assetUrl: "/course-materials/bel/employment-vignettes.pdf",
    fileName: "employment-vignettes.pdf",
    mimeType: "application/pdf",
  },
  "bel-danone": {
    assetUrl: "/course-materials/bel/danone.pdf",
    fileName: "danone.pdf",
    mimeType: "application/pdf",
  },
  "bel-etsy": {
    assetUrl: "/course-materials/bel/etsy.pdf",
    fileName: "etsy.pdf",
    mimeType: "application/pdf",
  },
  "bel-fairphone": {
    assetUrl: "/course-materials/bel/fairphone.pdf",
    fileName: "fairphone.pdf",
    mimeType: "application/pdf",
  },
  "bel-mastercard": {
    assetUrl: "/course-materials/bel/mastercard-ai.pdf",
    fileName: "mastercard-ai.pdf",
    mimeType: "application/pdf",
  },
  "bel-clueless": {
    assetUrl: "/course-materials/bel/clueless-ai-marketing.pdf",
    fileName: "clueless-ai-marketing.pdf",
    mimeType: "application/pdf",
  },
};

const COURSE_MATERIAL_FALLBACKS: Record<string, string> = {
  "bel-exam-announcement": "bel-practice-questions",
  "bel-lecture-10": "bel-practice-questions",
  "bel-lecture-march-16": "bel-employment-vignettes",
  "bel-lecture-12": "bel-employment-vignettes",
  "bel-lecture-13": "bel-danone",
  "bel-lecture-14": "bel-mastercard",
};

const inferMimeType = (material: CourseBrainSourceMaterial) => {
  const lowerPath = material.relativePath.toLowerCase();
  if (lowerPath.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerPath.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lowerPath.endsWith(".rtf")) {
    return "application/rtf";
  }
  return "application/octet-stream";
};

const inferFileName = (material: CourseBrainSourceMaterial) => {
  const parts = material.relativePath.split("/");
  return parts[parts.length - 1] ?? `${material.id}.bin`;
};

const listRelatedConceptLabels = (
  courseBrain: CourseBrain,
  material: CourseBrainSourceMaterial,
) => {
  const relatedCaseId =
    courseBrain.cases.find((entry) => entry.sourceId === material.id)?.id ?? null;
  const relatedConcepts = courseBrain.concepts.filter((concept) =>
    isConceptRelatedToMaterial(concept, material.id) ||
    (relatedCaseId ? concept.caseIds.includes(relatedCaseId) : false),
  );

  return relatedConcepts.slice(0, 5).map((concept) => concept.label);
};

const isConceptRelatedToMaterial = (
  concept: CourseBrainConcept,
  materialId: string,
) => concept.sourceIds.includes(materialId);

const buildExtractedText = (
  courseBrain: CourseBrain,
  material: CourseBrainSourceMaterial,
) => {
  const relatedCase =
    courseBrain.cases.find((entry) => entry.sourceId === material.id) ?? null;
  const relatedConceptLabels = listRelatedConceptLabels(courseBrain, material);
  const relevantArchetypes = courseBrain.questionArchetypes
    .filter((entry) => entry.sourceId === material.id)
    .slice(0, 4);

  return [
    `Source title: ${material.title}`,
    `Source kind: ${material.kind}`,
    `Scope note: ${material.summary}`,
    material.kind === "syllabus"
      ? `Course scope: ${courseBrain.scopeSummary}`
      : null,
    material.kind === "syllabus" && courseBrain.focusTopics.length > 0
      ? `Focus topics: ${courseBrain.focusTopics.join(", ")}`
      : null,
    relatedCase ? `Case summary: ${relatedCase.summary}` : null,
    relatedCase ? `Core dilemma: ${relatedCase.ethicalDilemma}` : null,
    relatedConceptLabels.length > 0
      ? `Relevant concepts: ${relatedConceptLabels.join(", ")}`
      : null,
    relevantArchetypes.length > 0 ? "Question patterns:" : null,
    ...relevantArchetypes.map(
      (entry) => `- ${entry.label}: ${entry.description}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
};

const buildMaterialReference = (
  courseBrain: CourseBrain,
  material: CourseBrainSourceMaterial,
): CourseMaterialReference => {
  const openableAsset = OPENABLE_COURSE_MATERIAL_ASSETS[material.id];

  return {
    materialId: material.id,
    courseBrainVersionId: courseBrain.version,
    title: material.title,
    kind: material.kind,
    mimeType: openableAsset?.mimeType ?? inferMimeType(material),
    fileName: openableAsset?.fileName ?? inferFileName(material),
    assetUrl: openableAsset?.assetUrl ?? null,
    openableInSession: Boolean(openableAsset),
    summary: material.summary,
    extractedText: buildExtractedText(courseBrain, material),
    fallbackMaterialId: COURSE_MATERIAL_FALLBACKS[material.id] ?? null,
  };
};

export const listCourseMaterialsForStudyContext = (
  studyContext: SessionStudyContext | null | undefined,
) => {
  const courseBrain = getCourseBrainForStudyContext(studyContext);
  if (!courseBrain) {
    return [];
  }

  return courseBrain.sourceMaterials.map((material) =>
    buildMaterialReference(courseBrain, material),
  );
};

export const listOpenableCourseMaterialsForStudyContext = (
  studyContext: SessionStudyContext | null | undefined,
) =>
  listCourseMaterialsForStudyContext(studyContext).filter(
    (material) => material.openableInSession,
  );

export const resolveCourseMaterialForStudyContext = (
  studyContext: SessionStudyContext | null | undefined,
  materialId: string,
) =>
  listCourseMaterialsForStudyContext(studyContext).find(
    (material) => material.materialId === materialId,
  ) ?? null;

export const resolveSuggestedCourseMaterialForStudyContext = (
  studyContext: SessionStudyContext | null | undefined,
  materialId: string,
) => {
  const materials = listCourseMaterialsForStudyContext(studyContext);
  const current = materials.find((material) => material.materialId === materialId);
  if (current?.fallbackMaterialId) {
    return (
      materials.find(
        (material) => material.materialId === current.fallbackMaterialId,
      ) ?? null
    );
  }

  return (
    materials.find((material) => material.openableInSession && material.kind === "practice_questions") ??
    materials.find((material) => material.openableInSession && material.kind === "case") ??
    materials.find((material) => material.openableInSession) ??
    null
  );
};
