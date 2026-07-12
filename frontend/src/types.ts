export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  dueDate?: string;
  priority: TaskPriority;
  prioritySource: "manual" | "ai";
  status: TaskStatus;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export type HabitExtractionValue = "done" | "missed" | "unclear";

export interface JournalEntry {
  userId: string;
  entryId: string;
  date: string;
  text: string;
  voiceInput: boolean;
  aiExtracted?: Record<"water" | "exercise" | "medicine", HabitExtractionValue>;
  createdAt: string;
  updatedAt: string;
}

export type HabitType = "water" | "exercise" | "medicine";
export type HabitStatus = "done" | "missed" | "skipped";

export interface HabitLog {
  userId: string;
  dateHabitType: string;
  date: string;
  habitType: HabitType;
  status: HabitStatus;
  source: "manual" | "ai-journal";
  note?: string;
  createdAt: string;
  updatedAt: string;
}
