import { TwelveLabs } from "twelvelabs-js";
import type { ComplianceRule, ComplianceReport, Status } from "./types";

const client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY! });

const COMPLIANCE_RULES = [
  {
    id: 1,
    name: "Product Visibility",
    prompt:
      "Does this video show a clearly visible product with readable branding or packaging? Answer yes or no and explain what you see.",
    passOn: "yes",
  },
  {
    id: 2,
    name: "Sponsorship Disclosure",
    prompt:
      "Does the creator verbally or visually disclose a paid sponsorship using words like #ad, #sponsored, or paid partnership? Answer yes or no with timestamp if yes.",
    passOn: "yes",
  },
  {
    id: 3,
    name: "Health Claims",
    prompt:
      "Does the creator make any unverifiable health or scientific claims about a product such as clinically proven, dermatologist tested, or removes wrinkles? Answer yes or no and quote the exact claim if yes.",
    passOn: "no",
  },
  {
    id: 4,
    name: "Competitor Mentions",
    prompt:
      "Are any competitor beauty or makeup brand products visible or mentioned in this video? Answer yes or no and name the competitor if yes.",
    passOn: "no",
  },
  {
    id: 5,
    name: "Correct Product Usage",
    prompt:
      "Is the product being applied or used correctly based on standard makeup application? Answer yes or no and describe what you observe.",
    passOn: "yes",
  },
  {
    id: 6,
    name: "Product Identification",
    prompt:
      "What is the main product featured in this video? Provide the brand name, product type, and shade if visible.",
    passOn: null, // informational only — always counted as passed
  },
] as const;

// Module-level cache; also respects TWELVELABS_INDEX_ID env var for persistence
let cachedIndexId: string | null = process.env.TWELVELABS_INDEX_ID || null;

export async function createIndex(): Promise<string> {
  const response = await client.indexes.create({
    indexName: `glowbrand-compliance-${Date.now()}`,
    models: [{ modelName: "pegasus1.5", modelOptions: ["visual", "audio"] }],
  });
  if (!response.id) throw new Error("Index creation returned no ID");
  return response.id;
}

export async function ensureIndex(): Promise<string> {
  if (cachedIndexId) return cachedIndexId;
  cachedIndexId = await createIndex();
  console.warn(
    `[TwelveLabs] New index created: ${cachedIndexId}` +
      ` — add TWELVELABS_INDEX_ID=${cachedIndexId} to .env.local to reuse it across restarts`
  );
  return cachedIndexId;
}

export async function uploadVideo(
  indexId: string,
  videoUrl: string
): Promise<string> {
  const task = await client.tasks.create({ indexId, videoUrl });
  if (!task.id) throw new Error("Task creation returned no ID");
  return task.id;
}

export async function waitForIndexing(taskId: string): Promise<string> {
  const completed = await client.tasks.waitForDone(taskId, {
    sleepInterval: 5,
    callback: (task) =>
      console.log(`[TwelveLabs] Task ${taskId}: ${task.status}`),
  });

  if (completed.status === "failed") throw new Error("Video indexing failed");
  if (!completed.videoId) throw new Error("Indexing complete but videoId missing");

  return completed.videoId;
}

// Pegasus 1.5 does not support videoId — pass the video URL directly via the
// `video` parameter. No pre-indexing step is needed.
export async function analyzeVideo(videoUrl: string): Promise<ComplianceReport> {
  const results: ComplianceRule[] = [];

  for (const rule of COMPLIANCE_RULES) {
    const response = await client.analyze({
      modelName: "pegasus1.5",
      video: { type: "url", url: videoUrl },
      prompt: rule.prompt,
    });
    const text = (response.data ?? "").trim();
    const passed =
      rule.passOn === null
        ? true
        : text.toLowerCase().startsWith(rule.passOn);

    results.push({ id: rule.id, name: rule.name, passed, response: text });
  }

  return calculateScore(results);
}

// ─── Utility functions used by legacy API routes ─────────────────────────────

export async function listIndexes() {
  return client.indexes.list();
}

export async function uploadVideoTask(indexId: string, videoUrl: string) {
  return client.tasks.create({ indexId, videoUrl });
}

export async function getTaskStatus(taskId: string) {
  return client.tasks.retrieve(taskId);
}

export async function generateText(videoId: string, prompt: string) {
  const response = await client.analyze({ videoId, prompt });
  return { data: response.data };
}

// ─── Score calculation ────────────────────────────────────────────────────────

export function calculateScore(rules: ComplianceRule[]): ComplianceReport {
  const scoredRules = rules.filter((r) => r.id !== 6); // rule 6 is informational
  const passedCount = scoredRules.filter((r) => r.passed).length;
  const score = Math.round((passedCount / scoredRules.length) * 100);

  let status: Status;
  if (score >= 80) status = "Compliant";
  else if (score >= 60) status = "Needs Review";
  else status = "Failed";

  return { score, status, rules };
}
