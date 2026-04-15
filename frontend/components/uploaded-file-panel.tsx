'use client';

import { useEffect, useMemo, useState } from "react";

import { PanelCard } from "@/components/ui/panel-card";
import { MarkdownText } from "@/components/ui/markdown-text";
import { SectionHeader } from "@/components/ui/section-header";
import { readUploadedFileBlob } from "@/lib/uploaded-file-storage";
import type { FileArtifact } from "@/types/session";

interface UploadedFilePanelProps {
  files: FileArtifact[];
  selectedFileId: string | null;
  onSelectFile: (artifactId: string) => void;
}

export function UploadedFilePanel({
  files,
  selectedFileId,
  onSelectFile,
}: UploadedFilePanelProps) {
  const selectedFile =
    files.find((artifact) => artifact.id === selectedFileId) ?? files[0] ?? null;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let nextObjectUrl: string | null = null;

    const loadBlob = async () => {
      if (!selectedFile) {
        setObjectUrl(null);
        return;
      }

      if (selectedFile.type === "course_material_file") {
        setObjectUrl(selectedFile.assetUrl);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const blob = await readUploadedFileBlob(selectedFile.storageKey);
      if (isCancelled) {
        return;
      }

      if (!blob) {
        setObjectUrl(null);
        setIsLoading(false);
        return;
      }

      nextObjectUrl = URL.createObjectURL(blob);
      setObjectUrl(nextObjectUrl);
      setIsLoading(false);
    };

    void loadBlob();

    return () => {
      isCancelled = true;
      if (nextObjectUrl && selectedFile?.type === "uploaded_file") {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [selectedFile]);

  const viewer = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    if (isLoading) {
      return (
        <div className="flex min-h-[70vh] items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 text-sm text-slate-500">
          Loading file...
        </div>
      );
    }

    if (!objectUrl) {
      return (
        <div className="flex min-h-[70vh] items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
          File preview is unavailable right now.
        </div>
      );
    }

    if (selectedFile.mimeType.startsWith("image/")) {
      return (
        <div className="rounded-[28px] border border-slate-200 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectUrl}
            alt={selectedFile.title}
            className="mx-auto max-h-[72vh] w-auto max-w-full rounded-2xl object-contain"
          />
        </div>
      );
    }

    if (selectedFile.mimeType === "application/pdf") {
      return (
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
          <iframe
            title={selectedFile.title}
            src={objectUrl}
            className="min-h-[82vh] w-full bg-white"
          />
        </div>
      );
    }

    return (
      <div className="flex min-h-[70vh] items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
        This file type is uploaded and available to the tutor, but preview is
        not supported yet.
      </div>
    );
  }, [isLoading, objectUrl, selectedFile]);

  if (!selectedFile) {
    return (
      <div className="p-6">
        <PanelCard>
          <SectionHeader title="File" subtitle="No uploaded file yet." />
          <p className="text-sm text-slate-600">
            Use the plus button in the tab bar to upload a worksheet PDF or image,
            or let the tutor open a course PDF here.
          </p>
        </PanelCard>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PanelCard className="space-y-5">
        <SectionHeader
          title={selectedFile.title}
          subtitle={
            <MarkdownText inline className="text-[11px] text-slate-500">
              {selectedFile.summary}
            </MarkdownText>
          }
          right={
            <div className="flex items-center gap-2">
              {files.length > 1 ? (
                <select
                  value={selectedFile.id}
                  onChange={(event) => onSelectFile(event.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition-colors focus:border-slate-400"
                >
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.title}
                    </option>
                  ))}
                </select>
              ) : null}
              {objectUrl ? (
                <a
                  href={objectUrl}
                  download={selectedFile.fileName}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Download
                </a>
              ) : null}
            </div>
          }
        />

        {viewer}
      </PanelCard>
    </div>
  );
}
