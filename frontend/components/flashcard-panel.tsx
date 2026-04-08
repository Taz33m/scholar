'use client';

import { useEffect } from "react";

import { Flashcard, FlashcardSessionState } from "@/types/flashcard";
import { FlashcardCard } from "@/components/flashcard-card";
import { cn } from "@/lib/utils";

interface FlashcardPanelProps {
  cards: Flashcard[];
  mode: FlashcardSessionState["mode"];
  currentIndex: number;
  isFlipped: boolean;
  flipCard: () => void;
  nextCard: () => void;
  previousCard: () => void;
}

export const FlashcardPanel = ({
  cards,
  mode,
  currentIndex,
  isFlipped,
  flipCard,
  nextCard,
  previousCard,
}: FlashcardPanelProps) => {
  const currentCard = cards[currentIndex];
  const progress =
    cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowRight" && currentIndex < cards.length - 1) {
        event.preventDefault();
        nextCard();
      }

      if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        previousCard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cards.length, currentIndex, nextCard, previousCard]);

  if (mode === "generating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-brand-gray-medium/20 bg-white/80 p-8 text-sm text-brand-gray-medium shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-gray-medium/20 border-t-brand-gray-dark" />
        <span className="font-medium">Generating flashcards…</span>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="min-h-[12rem] rounded-xl border border-brand-gray-medium/15 bg-white shadow-sm" />
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[44rem] flex-col items-center gap-5">
      <div className="w-full max-w-[40rem] space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gray-medium/70">
          <span>Progress</span>
          <span>{currentIndex + 1} of {cards.length}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-gray-medium/12">
          <div
            className="h-full rounded-full bg-brand-gray-dark transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <FlashcardCard card={currentCard} isFlipped={isFlipped} />

      <div className="flex w-full max-w-[40rem] items-center justify-center gap-3 text-xs">
        <button
          type="button"
          onClick={previousCard}
          disabled={currentIndex === 0}
          className={cn(
            'min-w-[7.5rem] rounded-full border border-brand-gray-medium/18 bg-white px-4 py-2.5 font-medium text-brand-gray-medium transition-all duration-200 hover:border-brand-gray-medium/35 hover:text-brand-gray-dark hover:shadow-sm active:scale-[0.98]',
            currentIndex === 0 && 'pointer-events-none opacity-40'
          )}
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={flipCard}
          className="min-w-[8.5rem] rounded-full border border-brand-gray-dark bg-brand-gray-dark px-5 py-2.5 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-gray-medium active:scale-[0.98]"
        >
          Flip
        </button>
        <button
          type="button"
          onClick={nextCard}
          disabled={currentIndex === cards.length - 1}
          className={cn(
            'min-w-[7.5rem] rounded-full border border-brand-gray-medium/18 bg-white px-4 py-2.5 font-medium text-brand-gray-medium transition-all duration-200 hover:border-brand-gray-medium/35 hover:text-brand-gray-dark hover:shadow-sm active:scale-[0.98]',
            currentIndex === cards.length - 1 && 'pointer-events-none opacity-40'
          )}
        >
          Next →
        </button>
      </div>
    </section>
  );
};
