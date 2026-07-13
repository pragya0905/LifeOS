import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { z } from "zod";

const HabitExtractionSchema = z.object({
  waterMl: z.number().nullable(),
  exerciseMinutes: z.number().nullable(),
});

export type HabitExtraction = z.infer<typeof HabitExtractionSchema>;

const HABIT_SYSTEM_PROMPT =
  "Extract how much water (in milliliters) and how much exercise (in minutes) the person " +
  "did today, based on their journal entry. If an amount is mentioned in different units " +
  "(glasses, liters, hours, etc.), convert it to milliliters/minutes — a glass of water is " +
  "about 250ml. If a habit isn't mentioned at all, return null for that field.";

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

export async function extractHabitsFromJournal(text: string): Promise<HabitExtraction> {
  const client = await getClient();
  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: HABIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(HabitExtractionSchema) },
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
