import type {
  CanonicalSelectedFileSessionState,
  SelectedFileRef,
} from "@/lib/tutor-runtime/types";
import type {
  FileArtifact,
  FileSessionContext,
} from "@/types/session";

const toSelectedFileRef = (artifact: FileArtifact): SelectedFileRef => ({
  selectedFileId: artifact.id,
  selectedFileType: artifact.type,
  title: artifact.title,
  selectedFileProvenance:
    artifact.type === "course_material_file" ? "course_material" : "uploaded",
  materialId:
    artifact.type === "course_material_file" ? artifact.materialId : null,
});

export const resolveCanonicalSelectedFileArtifact = ({
  fileArtifacts,
  fileState,
}: CanonicalSelectedFileSessionState): FileArtifact | null =>
  fileArtifacts.find((artifact) => artifact.id === fileState.activeFileArtifactId) ??
  fileArtifacts[0] ??
  null;

export const resolveCanonicalSelectedFile = (
  sessionState: CanonicalSelectedFileSessionState,
): SelectedFileRef | null => {
  const artifact = resolveCanonicalSelectedFileArtifact(sessionState);
  return artifact ? toSelectedFileRef(artifact) : null;
};

export const buildFileContextFromSelectedArtifact = (
  artifact: FileArtifact | null | undefined,
): FileSessionContext | null =>
  artifact
    ? {
        artifactId: artifact.id,
        title: artifact.title,
        summary: artifact.summary,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        extractedText: artifact.extractedText,
        provenance: artifact.provenance,
        materialId:
          artifact.type === "course_material_file" ? artifact.materialId : null,
        assetUrl:
          artifact.type === "course_material_file" ? artifact.assetUrl : null,
      }
    : null;

export const normalizeIncomingFileContext = (
  fileContext:
    | (Omit<FileSessionContext, "materialId" | "assetUrl"> & {
        materialId?: string | null;
        assetUrl?: string | null;
      })
    | null
    | undefined,
  uploadedFileContext:
    | (Omit<FileSessionContext, "materialId" | "assetUrl"> & {
        materialId?: string | null;
        assetUrl?: string | null;
      })
    | null
    | undefined,
): FileSessionContext | null => {
  const next = fileContext ?? uploadedFileContext;
  if (!next) {
    return null;
  }

  return {
    artifactId: next.artifactId,
    title: next.title,
    summary: next.summary,
    fileName: next.fileName,
    mimeType: next.mimeType,
    extractedText: next.extractedText,
    provenance: next.provenance,
    materialId: next.materialId ?? null,
    assetUrl: next.assetUrl ?? null,
  };
};
