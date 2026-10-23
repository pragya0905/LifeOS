import { summarizeToolResult, type ToolResultSummary } from "../../common/toolResultSummary";
import { toolErrorMessage } from "../../common/toolErrors";

export type ToolStreamEvent =
  | { type: "tool_use"; name: string; result?: ToolResultSummary }
  | { type: "tool_error"; name: string; message: string };

// The events a finished tool call adds to the stream, after its start event. A success gets a
// `result` event only when there is something to summarise (old frontends see a harmless
// duplicate tool_use). A failure gets exactly one tool_error, with a message safe to show.
export function toolEvents(
  name: string,
  input: Record<string, unknown>,
  outcome: { content: string; isError: boolean },
): ToolStreamEvent[] {
  if (outcome.isError) {
    return [{ type: "tool_error", name, message: toolErrorMessage(outcome.content) }];
  }
  const result = summarizeToolResult(name, input, outcome.content);
  return result ? [{ type: "tool_use", name, result }] : [];
}
