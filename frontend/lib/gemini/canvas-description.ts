import { GoogleGenAI } from '@google/genai';

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  return new GoogleGenAI({ apiKey });
};

const SYSTEM_PROMPT_BASE = `You are analyzing a whiteboard canvas used for teaching and learning. 
Describe what's drawn on it in detail, including:
- Shapes, lines, and drawings
- Text labels and annotations
- Layout and organization
- Relationships between elements
- Colors used
- Overall structure and purpose

Be concise but comprehensive. Focus on what would be useful for a teaching assistant to understand.`;

const CANVAS_DESCRIPTION_MODEL =
  process.env.GEMINI_CANVAS_DESCRIPTION_MODEL ?? 'gemini-2.5-flash-lite';
const CANVAS_DESCRIPTION_MAX_ATTEMPTS = 3;
const CANVAS_DESCRIPTION_RETRY_DELAYS_MS = [400, 1200];

/**
 * Extract base64 string from data URL
 */
function extractBase64FromDataUrl(dataUrl: string): string {
  // Remove data URL prefix (e.g., "data:image/png;base64,")
  return dataUrl.includes(',') 
    ? dataUrl.split(',')[1] 
    : dataUrl;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isTransientCanvasDescriptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('deadline exceeded') ||
    message.includes('temporarily')
  );
}

/**
 * Describe canvas content using Gemini Flash Lite Vision API
 * @param imageDataUrl - Base64 data URL of canvas screenshot
 * @param conversationContext - Optional context about what's been discussed
 * @returns Description of canvas content
 */
export async function describeCanvas(
  imageDataUrl: string,
  conversationContext?: string
): Promise<string> {
  // Extract base64 from data URL
  const base64Image = extractBase64FromDataUrl(imageDataUrl);

  // Build prompt with optional context
  let promptText: string;
  if (conversationContext) {
    promptText = `${SYSTEM_PROMPT_BASE}

CONVERSATION CONTEXT:
The user and teaching assistant have been discussing: ${conversationContext}

Use this context to better understand what's drawn on the canvas. If the conversation mentions specific topics (e.g., "photosynthesis", "mitosis"), use that knowledge to identify and describe related elements in the drawing. The context should guide your interpretation, but still describe what you actually see.

Describe everything visible on this canvas in detail. The conversation context above may help you understand what's being drawn. What shapes, text, and elements are present? How are they arranged? What is the overall purpose or topic?`;
  } else {
    promptText = `${SYSTEM_PROMPT_BASE}

Describe everything visible on this canvas in detail. What shapes, text, and elements are present? How are they arranged? What is the overall purpose or topic?`;
  }

  try {
    const ai = getGeminiClient();
    // Build contents array following Gemini format
    const contents = [
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      },
      { text: promptText },
    ];

    for (let attempt = 0; attempt < CANVAS_DESCRIPTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model: CANVAS_DESCRIPTION_MODEL,
          contents,
        });

        // Access response.text (Gemini format)
        return response.text || 'Unable to describe canvas';
      } catch (error) {
        const isLastAttempt = attempt === CANVAS_DESCRIPTION_MAX_ATTEMPTS - 1;
        if (isLastAttempt || !isTransientCanvasDescriptionError(error)) {
          throw error;
        }

        await sleep(
          CANVAS_DESCRIPTION_RETRY_DELAYS_MS[attempt] ??
            CANVAS_DESCRIPTION_RETRY_DELAYS_MS[CANVAS_DESCRIPTION_RETRY_DELAYS_MS.length - 1]
        );
      }
    }

    throw new Error('Canvas description retries exhausted');
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to describe canvas: ${error.message}`
        : 'Failed to describe canvas'
    );
  }
}
