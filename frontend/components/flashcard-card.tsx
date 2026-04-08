'use client';

import { Flashcard } from '@/types/flashcard';
import { cn } from '@/lib/utils';

interface FlashcardCardProps {
  card: Flashcard;
  isFlipped: boolean;
  className?: string;
}

export const FlashcardCard = ({ card, isFlipped, className }: FlashcardCardProps) => {
  return (
    <div className={cn('relative mx-auto h-[29rem] w-full max-w-[40rem] perspective-1800', className)}>
      <div
        className={cn(
          'relative h-full w-full rounded-[28px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] transform-style-3d will-change-transform',
          isFlipped ? 'rotate-y-180' : 'rotate-y-0'
        )}
      >
        {/* Front */}
        <article className="absolute inset-0 flex h-full w-full flex-col rounded-[28px] border border-brand-gray-medium/15 bg-white p-7 shadow-lg shadow-brand-gray-medium/5 backface-hidden">
          <header className="space-y-2">
            <h2 className="text-lg font-semibold leading-tight text-brand-gray-dark">{card.title}</h2>
            <p className="text-sm leading-relaxed text-brand-gray-medium">{card.coreIdea}</p>
          </header>
          <main className="mt-6 flex flex-1 items-center">
            <div className="w-full rounded-[24px] border border-brand-gray-medium/12 bg-slate-50/70 px-6 py-8">
              <p className="text-[1.15rem] font-medium leading-9 text-brand-gray-dark">{card.question}</p>
            </div>
          </main>
        </article>

        {/* Back */}
        <article className="absolute inset-0 flex h-full w-full flex-col rounded-[28px] border border-brand-orange-light/22 bg-brand-orange-light/8 p-7 text-brand-gray-dark shadow-lg shadow-brand-orange-light/5 rotate-y-180 backface-hidden">
          <header className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-brand-orange-dark/85">Answer</p>
            <h2 className="text-lg font-semibold leading-tight">{card.title}</h2>
          </header>
          <main className="mt-6 flex flex-1 items-center">
            <div className="w-full rounded-[24px] border border-brand-orange-light/20 bg-white/55 px-6 py-8">
              <div className="space-y-4">
                <p className="text-[1.05rem] leading-8 text-brand-gray-dark">{card.answer}</p>
                {card.source && (
                  <p className="text-xs text-brand-orange-dark">
                    Source: <span className="underline decoration-dotted decoration-brand-orange-dark/50">{card.source}</span>
                  </p>
                )}
              </div>
            </div>
          </main>
        </article>
      </div>
    </div>
  );
};
