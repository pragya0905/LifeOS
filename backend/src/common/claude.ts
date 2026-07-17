import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { z } from "zod";

const JournalExtractionSchema = z.object({
  waterMl: z.number().nullable(),
  exerciseMinutes: z.number().nullable(),
  food: z.string().nullable(),
  sleep: z.object({ bedTime: z.string(), wakeTime: z.string() }).nullable(),
  weightKg: z.number().nullable(),
  moodRating: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .nullable(),
  medicationNamesTaken: z.array(z.string()),
  routineStepsCompleted: z.array(z.string()),
  cycleEvent: z.enum(["period_start", "period_end", "symptom"]).nullable(),
  calls: z.array(z.object({ personName: z.string(), note: z.string().nullable() })),
  expenses: z.array(
    z.object({ category: z.string(), amount: z.number().nullable(), note: z.string().nullable() }),
  ),
});

export type JournalExtraction = z.infer<typeof JournalExtractionSchema>;

function buildJournalSystemPrompt(
  activeMedicationNames: string[],
  activeRoutineSteps: string[],
): string {
  const lines = [
    "Extract structured information mentioned in this personal journal entry. For every " +
      "field, only fill it in if genuinely mentioned — leave numbers/objects null and arrays " +
      "empty when a category isn't mentioned at all. Never invent values.",
    "- waterMl: water intake in milliliters (convert other units — a glass is about 250ml).",
    "- exerciseMinutes: exercise duration in minutes (convert other units).",
    "- food: a short free-text description of food/meals mentioned, or null.",
    "- sleep: { bedTime, wakeTime } as HH:MM 24-hour times if both are mentioned, else null.",
    "- weightKg: body weight in kilograms (convert lbs if needed).",
    "- moodRating: overall mood as an integer 1 (very bad) to 5 (very good), or null.",
    "- cycleEvent: 'period_start', 'period_end', or 'symptom' if a menstrual cycle event is " +
      "mentioned, else null.",
    "- calls: list of { personName, note } for each phone call mentioned.",
    "- expenses: list of { category, amount, note } for each expense/purchase mentioned " +
      "(amount null if not stated).",
  ];

  if (activeMedicationNames.length > 0) {
    lines.push(
      `- medicationNamesTaken: which of these medications were mentioned as taken today — ` +
        `${activeMedicationNames.join(", ")}. Return the exact name(s) from this list, or an ` +
        "empty array if none mentioned. Never return a name not in this list.",
    );
  } else {
    lines.push("- medicationNamesTaken: always an empty array (no medications tracked).");
  }

  if (activeRoutineSteps.length > 0) {
    lines.push(
      `- routineStepsCompleted: which of these routine steps were mentioned as done today — ` +
        `${activeRoutineSteps.join(", ")}. Return the exact step text(s) from this list, or an ` +
        "empty array if none mentioned. Never return text not in this list.",
    );
  } else {
    lines.push("- routineStepsCompleted: always an empty array (no routines tracked).");
  }

  return lines.join("\n");
}

const TaskPrioritySchema = z.object({
  priority: z.enum(["Low", "Medium", "High"]),
});

const TASK_PRIORITY_SYSTEM_PROMPT =
  "Suggest a priority (Low, Medium, or High) for a personal to-do task based on its title, " +
  "due date, and how much slack time remains versus the estimated effort needed. Weigh " +
  "urgency and importance: soon due dates and language like 'urgent', 'ASAP', or a hard " +
  "deadline push toward High; vague or low-stakes tasks ('someday', 'maybe') push toward " +
  "Low; a task with little slack between now and its deadline relative to its estimated " +
  "effort should lean High even if the wording sounds casual. Default to Medium when unclear.";

let cachedApiKey: string | undefined;
let cachedClient: Anthropic | undefined;

async function getClient(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  if (!cachedApiKey) {
    const ssm = new SSMClient({});
    const result = await ssm.send(
      new GetParameterCommand({
        Name: process.env.ANTHROPIC_API_KEY_PARAM,
        WithDecryption: true,
      }),
    );
    if (!result.Parameter?.Value) {
      throw new Error("Anthropic API key parameter is empty");
    }
    cachedApiKey = result.Parameter.Value;
  }
  cachedClient = new Anthropic({ apiKey: cachedApiKey });
  return cachedClient;
}

export async function extractJournalInfo(
  text: string,
  activeMedicationNames: string[],
  activeRoutineSteps: string[],
): Promise<JournalExtraction> {
  const client = await getClient();
  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 768,
    system: buildJournalSystemPrompt(activeMedicationNames, activeRoutineSteps),
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(JournalExtractionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parsed structured output");
  }
  return response.parsed_output;
}

export async function suggestTaskPriority(
  title: string,
  dueDate?: string,
  dueTime?: string,
  estimatedHours?: number,
): Promise<"Low" | "Medium" | "High"> {
  let hoursUntilDue: number | undefined;
  if (dueDate) {
    const due = new Date(`${dueDate}T${dueTime ?? "23:59"}:00`);
    hoursUntilDue = (due.getTime() - Date.now()) / (1000 * 60 * 60);
  }

  // Deterministic guardrail: an unstarted task literally cannot finish in time if the
  // hours remaining until its deadline are less than the estimated effort — no ambiguity,
  // no need to ask the model.
  if (
    estimatedHours !== undefined &&
    hoursUntilDue !== undefined &&
    hoursUntilDue <= estimatedHours
  ) {
    return "High";
  }

  const client = await getClient();
  const contentLines = [`Title: ${title}`];
  if (dueDate) contentLines.push(`Due date: ${dueDate}${dueTime ? ` ${dueTime}` : ""}`);
  if (estimatedHours !== undefined) contentLines.push(`Estimated effort: ${estimatedHours} hours`);
  if (hoursUntilDue !== undefined) {
    contentLines.push(`Hours remaining until due: ${hoursUntilDue.toFixed(1)}`);
  }

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 128,
    system: TASK_PRIORITY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentLines.join("\n") }],
    output_config: { format: zodOutputFormat(TaskPrioritySchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parsed structured output");
  }
  return response.parsed_output.priority;
}
