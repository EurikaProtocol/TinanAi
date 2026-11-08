import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { AssistTinanaiBody, AssistTinanaiResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getAssistantInstructions } from "../lib/greenleaf-mode";
import { responseLanguageInstruction } from "../lib/response-language";
import { buildRateLimitKey, createFixedWindowRateLimiter } from "../lib/fixed-window-rate-limit";
import { authorizePaidService } from "../lib/tinan-payment-gate";

const router: IRouter = Router();
const requestWindowMs = 15 * 60 * 1000;
const requestLimiter = createFixedWindowRateLimiter({
  windowMs: requestWindowMs,
  maxRequests: 12,
});
let activeRequests = 0;

router.post("/tinanai/assist", async (req, res): Promise<void> => {
  const parsed = AssistTinanaiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid tool, prompt, and document text." });
    return;
  }
  if (parsed.data.prompt.trim().length === 0) {
    res.status(400).json({ error: "Enter a prompt before continuing." });
    return;
  }
  if (parsed.data.mode === "document" && !parsed.data.documentText?.trim()) {
    res.status(400).json({ error: "Add document text before requesting an analysis." });
    return;
  }
  if (activeRequests >= 3 || !requestLimiter.take(buildRateLimitKey(getAuth(req).userId, req.ip))) {
    res.setHeader("Retry-After", String(Math.ceil(requestWindowMs / 1000)));
    res.status(429).json({ error: "EUREKA CORE is busy or your request limit was reached. Please try again later." });
    return;
  }

  activeRequests += 1;
  try {
    const service = parsed.data.mode === "builder" ? "ai-builder" : parsed.data.mode === "tokenization" ? "data-tokenization" : null;
    if (service && !await authorizePaidService(req, res, service)) return;
    const { mode, prompt, history = [], documentText, greenLeafMode, language } = parsed.data;
    const messages = [
      {
        role: "system" as const,
        content: `${getAssistantInstructions(mode, greenLeafMode)}\n\n${responseLanguageInstruction(language)}`,
      },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      {
        role: "user" as const,
        content: documentText
          ? `${prompt}\n\n<document>\n${documentText}\n</document>`
          : prompt,
      },
    ];
    const model = mode === "builder" ? "gpt-5.6-terra" : "gpt-5.4-mini";
    const response = await openai.chat.completions.create(
      {
        model,
        max_completion_tokens: 8192,
        messages,
      },
      { timeout: 120_000 },
    );
    req.log.info(
      {
        userId: getAuth(req).userId ?? null,
        model,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      "TINANAI assistant usage",
    );
    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) {
      res.status(500).json({ error: "EUREKA CORE returned an empty response. Please try again." });
      return;
    }
    res.json(AssistTinanaiResponse.parse({ reply }));
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "TINANAI assistance failed",
    );
    res.status(500).json({ error: "EUREKA CORE could not complete this request. Please try again shortly." });
  } finally {
    activeRequests -= 1;
  }
});

export default router;
