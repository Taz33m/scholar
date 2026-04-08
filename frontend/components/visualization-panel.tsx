'use client';

import { useState } from 'react';
import Image from 'next/image';
import { VisualizationState } from '@/types/visualization';
import { copyImageToClipboard } from '@/lib/clipboard';
import { PanelCard } from '@/components/ui/panel-card';
import { SectionHeader } from '@/components/ui/section-header';
import { MarkdownText } from '@/components/ui/markdown-text';

interface VisualizationPanelProps {
  visualization: VisualizationState;
}

const CopyGlyph = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
    <rect x="5" y="3" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M3.5 10.5V5.5C3.5 4.39543 4.39543 3.5 5.5 3.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

export const VisualizationPanel = ({ visualization }: VisualizationPanelProps) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopyToClipboard = async () => {
    if (!visualization.imageData) return;

    try {
      await copyImageToClipboard(visualization.imageData);
      setCopyStatus('copied');
      // Reset status after 3 seconds
      setTimeout(() => setCopyStatus('idle'), 3000);
    } catch (error) {
      console.error('[visualization] Copy failed:', error);
      setCopyStatus('error');
      // Reset status after 3 seconds
      setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };

  if (visualization.mode === 'generating') {
    return (
      <div className="mx-auto flex max-w-[56rem] flex-col items-center justify-center gap-4 rounded-[24px] border border-brand-gray-medium/16 bg-white/85 p-10 text-sm text-brand-gray-medium shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-gray-medium/20 border-t-brand-gray-dark" />
        <span className="font-medium">Generating visualization…</span>
      </div>
    );
  }

  if (!visualization.imageData) {
    return (
      <PanelCard className="mx-auto max-w-[56rem] rounded-[24px] border-dashed border-brand-gray-medium/16 bg-white/70 p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-brand-gray-dark">No visualization generated yet.</p>
        <p className="mt-3 text-xs leading-relaxed text-brand-gray-medium">
          Ask the tutor to generate a visualization or illustration.
        </p>
      </PanelCard>
    );
  }

  return (
    <section className="mx-auto flex max-w-[56rem] flex-col gap-5">
      <PanelCard className="rounded-[24px] border-brand-gray-medium/14 p-5 shadow-sm">
        <SectionHeader
          title="Visualization"
          subtitle={
            visualization.description ? (
              <MarkdownText inline className="text-[11px] text-slate-500">
                {visualization.description}
              </MarkdownText>
            ) : (
              'Generated visual artifact'
            )
          }
        />

        <button
          type="button"
          onClick={handleCopyToClipboard}
          className="group block w-full overflow-hidden rounded-[22px] border border-brand-gray-medium/12 bg-slate-50/70 text-left transition-colors hover:border-brand-gray-medium/20"
          aria-label="Copy visualization image"
        >
          <div className="relative h-[34rem] w-full cursor-copy">
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
              {copyStatus === 'copied' ? (
                <span className="rounded-full bg-brand-gray-dark/88 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
                  Copied
                </span>
              ) : null}
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-brand-gray-dark shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-[1.03]">
                <CopyGlyph />
              </span>
            </div>
            <Image
              src={visualization.imageData}
              alt={visualization.description || 'Generated visualization'}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 896px"
              className="object-contain"
            />
          </div>
        </button>
      </PanelCard>

      {copyStatus === 'copied' ? (
        <div className="mx-auto max-w-[40rem] rounded-[20px] border border-brand-orange-light/24 bg-brand-orange-light/8 px-4 py-3 text-center text-xs text-brand-orange-dark shadow-sm">
          Paste on the canvas with <kbd className="rounded border border-brand-orange-light/30 bg-brand-orange-light/16 px-2 py-1 font-mono text-[10px]">Cmd+V</kbd> or <kbd className="rounded border border-brand-orange-light/30 bg-brand-orange-light/16 px-2 py-1 font-mono text-[10px]">Ctrl+V</kbd>
        </div>
      ) : copyStatus === 'error' ? (
        <div className="mx-auto max-w-[40rem] rounded-[20px] border border-brand-orange-dark/24 bg-brand-orange-dark/8 px-4 py-3 text-center text-xs text-brand-orange-dark shadow-sm">
          Could not copy the image right now. Try again.
        </div>
      ) : null}

      {visualization.description ? (
        <PanelCard className="mx-auto max-w-[56rem] rounded-[24px] border-brand-gray-medium/14 p-5 shadow-sm">
          <SectionHeader title="Notes" subtitle="What this visual is meant to show" />
          <div className="rounded-[20px] border border-brand-gray-medium/12 bg-white px-5 py-4">
            <MarkdownText className="text-sm leading-7 text-brand-gray-dark">
              {visualization.description}
            </MarkdownText>
          </div>
        </PanelCard>
      ) : null}
    </section>
  );
};
