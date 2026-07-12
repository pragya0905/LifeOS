import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { z } from "zod";

const HabitExtractionSchema = z.object({
  water: z.enum(["done", "missed", "unclear"]),
  exercise: z.enum(["done", "missed", "unclear"]),
  medicine: z.enum(["done", "missed", "unclear"]),
});

export type HabitExtraction = z.infer<typeof HabitExtractionSchema>;

const HABIT_SYSTEM_PROMPT =
  "Extract whether the following habits were mentioned as done, not done, or not mentioned at all: water, exercise, medicine.";

const TaskPrioritySchema = z.object({
  priority: z.enum(["Low", "Medium", "High"]),
});

const TASK_PRIORITY_SYSTEM_PROMPT =
  "Suggest a priority (Low, Medium, or High) for a personal to-do task based on its title " +
  "and due date. Weigh urgency and importance: soon due dates and language like 'urgent', " +
  "'ASAP', or a hard deadline push toward High; vague or low-stakes tasks ('someday', " +
  "'maybe') push toward Low. Default to Medium when unclear.";

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
): Promise<"Low" | "Medium" | "High"> {
  const client = await getClient();
  const userContent = dueDate ? `Title: ${title}\nDue date: ${dueDate}` : `Title: ${title}`;
  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 128,
    system: TASK_PRIORITY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(TaskPrioritySchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parsed structured output");
  }
  return response.parsed_output.priority;
}
