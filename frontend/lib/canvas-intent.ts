const EDIT_PATTERNS = [
  /\b(circle|highlight|box|underline|mark)\b/i,
  /\b(label|annotate|write|add text|put text)\b/i,
  /\b(connect|link|arrow)\b/i,
  /\b(erase|delete|remove|clear)\b/i,
  /\b(clean up|cleanup|tidy|reorganize|re-organize|rearrange)\b/i,
  /\b(redraw|redraw it|draw on|draw onto|sketch on)\b/i,
  /\b(modify|edit|change|fix|correct)\b.{0,24}\b(canvas|whiteboard|board|drawing|diagram)\b/i,
  /\b(move|shift)\b.{0,24}\b(on the canvas|on the board|this|that)\b/i,
];

const INSPECTION_PATTERNS = [
  /\bwhat did i draw\b/i,
  /\bwhat(?:'s| is) on the (?:canvas|board|whiteboard)\b/i,
  /\bcan you see (?:what i drew|the canvas|the board)\b/i,
  /\bdescribe\b.{0,24}\b(canvas|board|whiteboard|drawing|diagram)\b/i,
  /\binspect\b.{0,24}\b(canvas|board|whiteboard|drawing|diagram)\b/i,
  /\bbased on what i drew\b/i,
  /\bexplain\b.{0,24}\b(drawing|diagram|canvas|board|this)\b/i,
  /\bwhat do you understand\b/i,
];

export const isExplicitCanvasEditRequest = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return false;
  return EDIT_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isCanvasInspectionRequest = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return false;
  return INSPECTION_PATTERNS.some((pattern) => pattern.test(normalized));
};
