export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";
export type PrioritySource = "manual" | "ai";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  dueDate?: string;
  priority: TaskPriority;
  prioritySource: PrioritySource;
  status: TaskStatus;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export type HabitExtractionValue = "done" | "missed" | "unclear";

export interface JournalEntry {
  userId: string;
  date: string;
  text: string;
  voiceInput: boolean;
  aiExtracted?: Record<"water" | "exercise" | "medicine", HabitExtractionValue>;
  createdAt: string;
  updatedAt: string;
}

export type HabitType = "water" | "exercise" | "medicine";
export type HabitStatus = "done" | "missed" | "skipped";
export type HabitSource = "manual" | "ai-journal";

export interface HabitLog {
  userId: string;
  dateHabitType: string;
  date: string;
  habitType: HabitType;
  status: HabitStatus;
  source: HabitSource;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
