import type {
  StudentGraphNode,
  StudentGraphRecommendation,
  StudentGraphStats,
  StudentGraphTier,
} from "@/lib/student-app/types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveStudentGraphTier(score: number): StudentGraphTier {
  const normalized = clampScore(score);

  if (normalized >= 78) {
    return "confident";
  }

  if (normalized >= 52) {
    return "developing";
  }

  return "emerging";
}

export function buildStudentGraphStats(nodes: StudentGraphNode[]): StudentGraphStats {
  if (nodes.length === 0) {
    return {
      conceptCount: 0,
      focusCount: 0,
      masteryAverage: 0,
      recentlyStudiedCount: 0,
    };
  }

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const masteryAverage = Math.round(
    nodes.reduce((sum, node) => sum + clampScore(node.masteryScore), 0) / nodes.length,
  );
  const recentlyStudiedCount = nodes.filter((node) => {
    if (!node.lastStudiedAt) {
      return false;
    }

    const timestamp = new Date(node.lastStudiedAt).getTime();
    return Number.isFinite(timestamp) && now - timestamp <= fourteenDaysMs;
  }).length;

  return {
    conceptCount: nodes.length,
    focusCount: nodes.filter((node) => node.masteryScore < 78).length,
    masteryAverage,
    recentlyStudiedCount,
  };
}

export function buildStudentGraphRecommendations(
  nodes: StudentGraphNode[],
  limit = 3,
): StudentGraphRecommendation[] {
  return [...nodes]
    .sort((left, right) => {
      if (left.masteryScore !== right.masteryScore) {
        return left.masteryScore - right.masteryScore;
      }

      return right.evidenceCount - left.evidenceCount;
    })
    .slice(0, limit)
    .map((node) => ({
      conceptId: node.id,
      conceptName: node.conceptName,
      masteryTier: node.masteryTier,
      reason:
        node.masteryTier === "emerging"
          ? "This area still needs reinforcement before later topics build on it."
          : node.masteryTier === "developing"
            ? "You have recent exposure here, but another session should make it steadier."
            : "Use this as a bridge concept for the next part of the course.",
    }));
}

export function getFallbackGraphPosition(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const columns = safeTotal <= 4 ? safeTotal : 3;
  const rows = Math.ceil(safeTotal / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 1 ? 50 : 18 + (64 / Math.max(columns - 1, 1)) * column;
  const y = rows === 1 ? 50 : 24 + (52 / Math.max(rows - 1, 1)) * row;

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}
