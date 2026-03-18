import { GoogleGenAI, Modality } from "@google/genai";

const DEFAULT_TOKEN_ENDPOINT =
  process.env.GEMINILEARN_TOKEN_ENDPOINT ??
  "http://127.0.0.1:3000/api/voice/token";

const DEFAULT_LIVE_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";

const DEFAULT_TOOL_NAME = "smoke_ping_tool";
const DEFAULT_TOOL_PROMPT = "ping";
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 10000;
const DEFAULT_TURN_COMPLETE_TIMEOUT_MS = 10000;
const DEFAULT_CLOSE_TIMEOUT_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createDeferred = () => {
  let resolve;
  let reject;
  let settled = false;

  const promise = new Promise((res, rej) => {
    resolve = (value) => {
      if (settled) return;
      settled = true;
      res(value);
    };
    reject = (error) => {
      if (settled) return;
      settled = true;
      rej(error);
    };
  });

  return { promise, resolve, reject };
};

const withTimeout = (promise, timeoutMs, label) =>
  Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }),
  ]);

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const createLogger = (log = console.log, prefix = "[smoke]") => ({
  info(message) {
    log(`${prefix} ${message}`);
  },
});

const formatResponseError = (status, payload) => {
  if (!payload) {
    return `HTTP ${status} with an unreadable response body.`;
  }

  return `HTTP ${status}: ${JSON.stringify(payload)}`;
};

export const fetchEphemeralToken = async ({
  tokenEndpoint = DEFAULT_TOKEN_ENDPOINT,
} = {}) => {
  let response;

  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(
      `Unable to reach ${tokenEndpoint}.${detail} Ensure the app is running on port 3000 and this command can access localhost.`,
    );
  }

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      `Token request failed for ${tokenEndpoint}: ${formatResponseError(response.status, payload)}`,
    );
  }

  const token = payload?.ephemeralKey;
  if (!token || typeof token !== "string") {
    throw new Error("Token response missing ephemeralKey.");
  }

  return {
    token,
    expiresAt:
      typeof payload?.expiresAt === "string" ? payload.expiresAt : null,
  };
};

export const runGeminiLiveSmoke = async ({
  tokenEndpoint = DEFAULT_TOKEN_ENDPOINT,
  liveModel = DEFAULT_LIVE_MODEL,
  toolName = DEFAULT_TOOL_NAME,
  toolPrompt = DEFAULT_TOOL_PROMPT,
  logger = createLogger(),
  toolCallTimeoutMs = DEFAULT_TOOL_CALL_TIMEOUT_MS,
  turnCompleteTimeoutMs = DEFAULT_TURN_COMPLETE_TIMEOUT_MS,
  closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
} = {}) => {
  const startedAt = Date.now();
  logger.info(`Requesting token from ${tokenEndpoint}`);
  const { token, expiresAt } = await fetchEphemeralToken({ tokenEndpoint });
  logger.info("Token request succeeded");
  if (expiresAt) {
    logger.info(`Token expires at ${expiresAt}`);
  }

  const ai = new GoogleGenAI({
    apiKey: token,
    apiVersion: "v1alpha",
  });

  let session = null;
  let liveError = null;
  let toolResponseSent = false;
  let receivedToolCalls = [];

  const closeDeferred = createDeferred();
  const toolCallDeferred = createDeferred();
  const turnCompleteDeferred = createDeferred();

  try {
    session = await ai.live.connect({
      model: liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: [{ text: `Always call ${toolName} when the user says "${toolPrompt}".` }],
        tools: [
          {
            functionDeclarations: [
              {
                name: toolName,
                description: "Returns a smoke-test pong result.",
                parameters: {
                  type: "OBJECT",
                  properties: {},
                },
              },
            ],
          },
        ],
      },
      callbacks: {
        onmessage: (message) => {
          const functionCalls = message.toolCall?.functionCalls ?? [];

          if (functionCalls.length > 0) {
            receivedToolCalls = functionCalls;
            logger.info(
              `Received tool call(s): ${functionCalls.map((call) => call.name).join(", ")}`,
            );
            toolCallDeferred.resolve(functionCalls);

            if (!toolResponseSent && session) {
              toolResponseSent = true;
              session.sendToolResponse({
                functionResponses: functionCalls.map((call) => ({
                  id: call.id,
                  name: call.name,
                  response: {
                    output: {
                      ok: true,
                      message: "pong",
                    },
                  },
                })),
              });
              logger.info("Tool response sent");
            }
          }

          if (toolResponseSent && message.serverContent?.turnComplete) {
            logger.info("Turn completed after tool response");
            turnCompleteDeferred.resolve();
          }
        },
        onerror: (event) => {
          liveError = event.error?.message ?? "Unknown live session error.";
          const error = new Error(`Live error: ${liveError}`);
          toolCallDeferred.reject(error);
          turnCompleteDeferred.reject(error);
        },
        onclose: (event) => {
          if (event?.reason) {
            logger.info(`Live session closed: ${event.reason}`);
          }
          closeDeferred.resolve();
        },
      },
    });

    logger.info(`Live connect succeeded (${liveModel})`);
    session.sendClientContent({ turns: toolPrompt, turnComplete: true });
    logger.info("Sent prompt to trigger tool call");

    await withTimeout(toolCallDeferred.promise, toolCallTimeoutMs, "Tool call");

    if (liveError) {
      throw new Error(`Live error after tool call: ${liveError}`);
    }

    await withTimeout(
      turnCompleteDeferred.promise,
      turnCompleteTimeoutMs,
      "Turn completion after tool response",
    );

    if (liveError) {
      throw new Error(`Live error after tool response: ${liveError}`);
    }

    const durationMs = Date.now() - startedAt;
    logger.info("Gemini Live tool-calling smoke test passed");

    return {
      ok: true,
      durationMs,
      tokenEndpoint,
      liveModel,
      toolCalls: receivedToolCalls.map((call) => call.name),
    };
  } finally {
    if (session) {
      session.close();
      await withTimeout(closeDeferred.promise, closeTimeoutMs, "Session close");
      logger.info("Live close succeeded");
    }
  }
};

export const createSmokeLogger = createLogger;
