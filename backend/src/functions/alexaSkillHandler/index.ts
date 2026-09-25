import Alexa, { ErrorHandler, RequestHandler, HandlerInput, SkillBuilders } from "ask-sdk-core";
import type { Response } from "ask-sdk-model";
import type { Task, HabitLog } from "../../common/types";

// Thin adapter only — no DynamoDB access, no duplicated business logic. Every
// intent below just translates voice into a call against the same HTTP API
// every other client (the web app) uses, with the OAuth access token Alexa
// forwards from account linking as the Bearer token. The existing getUserId()
// ownership pattern on the other side needs no changes: it already just
// reads `sub` from whatever verified JWT reaches it.
const API_URL = process.env.HTTP_API_URL as string;

const LINK_ACCOUNT_MESSAGE =
  "Your LifeOs account isn't linked yet. Please open the Alexa app and link your account to continue.";

const HABIT_UNIT_SPOKEN: Record<string, string> = {
  water: "milliliters",
  exercise: "minutes",
  steps: "steps",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getAccessToken(handlerInput: HandlerInput): string | undefined {
  return handlerInput.requestEnvelope.context.System.user.accessToken;
}

async function callApi<T>(token: string, path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} failed: ${res.status}${text ? ` ${text}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Alexa's AMAZON.DATE slot resolves to an ISO date (YYYY-MM-DD) for a specific
// day, but can also resolve to a week/month/season for vaguer phrases — treat
// anything that isn't a plain calendar date as "today" rather than guessing.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeDate(slotValue: string | undefined): string {
  return slotValue && ISO_DATE_RE.test(slotValue) ? slotValue : today();
}

// AMAZON.TIME resolves to "THH:MM" (ISO 8601 partial time) — strip the "T".
function normalizeTime(slotValue: string | undefined): string | undefined {
  if (!slotValue) return undefined;
  return slotValue.startsWith("T") ? slotValue.slice(1) : slotValue;
}

const LaunchRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
  },
  handle(handlerInput): Response {
    const speakOutput =
      "Welcome to LifeOs. You can say things like: log 500 milliliters of water, " +
      "what's on my schedule today, add a task, or dictate a journal entry.";
    return handlerInput.responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();
  },
};

const LogHabitIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "LogHabitIntent"
    );
  },
  async handle(handlerInput): Promise<Response> {
    const token = getAccessToken(handlerInput);
    if (!token) {
      return handlerInput.responseBuilder.speak(LINK_ACCOUNT_MESSAGE).withLinkAccountCard().getResponse();
    }

    const habitType = Alexa.getSlotValue(handlerInput.requestEnvelope, "habitType")?.toLowerCase();
    const amountRaw = Alexa.getSlotValue(handlerInput.requestEnvelope, "amount");
    const amount = amountRaw !== undefined ? Number(amountRaw) : NaN;

    if (!habitType || !(habitType in HABIT_UNIT_SPOKEN) || !Number.isFinite(amount) || amount < 0) {
      const msg = "Sorry, I didn't catch a valid habit and amount. Try saying, log 500 milliliters of water.";
      return handlerInput.responseBuilder.speak(msg).reprompt(msg).getResponse();
    }

    try {
      await callApi(token, `/habits/${today()}/${habitType}`, "PATCH", { value: amount });
      const speakOutput = `Logged ${amount} ${HABIT_UNIT_SPOKEN[habitType]} of ${habitType}.`;
      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    } catch (err) {
      console.error("LogHabitIntent failed:", err);
      const msg = "Sorry, I couldn't log that right now. Please try again later.";
      return handlerInput.responseBuilder.speak(msg).getResponse();
    }
  },
};

const DictateJournalIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "DictateJournalIntent"
    );
  },
  async handle(handlerInput): Promise<Response> {
    const token = getAccessToken(handlerInput);
    if (!token) {
      return handlerInput.responseBuilder.speak(LINK_ACCOUNT_MESSAGE).withLinkAccountCard().getResponse();
    }

    const text = Alexa.getSlotValue(handlerInput.requestEnvelope, "entryText")?.trim();
    if (!text) {
      const msg = "Sorry, I didn't catch what to write. Try saying, tell LifeOs I went for a run.";
      return handlerInput.responseBuilder.speak(msg).reprompt(msg).getResponse();
    }

    try {
      // Same POST /journal call the app's own voice input makes — same
      // conditional-put-per-day and Claude extraction pipeline downstream.
      await callApi(token, "/journal", "POST", { date: today(), text, voiceInput: true });
      return handlerInput.responseBuilder
        .speak("Got it, I've added that to your journal.")
        .getResponse();
    } catch (err) {
      console.error("DictateJournalIntent failed:", err);
      const status = err instanceof Error && err.message.includes("409") ? "conflict" : "error";
      const msg =
        status === "conflict"
          ? "You already have a journal entry for today — open the app if you'd like to edit it."
          : "Sorry, I couldn't save that entry right now. Please try again later.";
      return handlerInput.responseBuilder.speak(msg).getResponse();
    }
  },
};

const CreateTaskIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CreateTaskIntent"
    );
  },
  async handle(handlerInput): Promise<Response> {
    const token = getAccessToken(handlerInput);
    if (!token) {
      return handlerInput.responseBuilder.speak(LINK_ACCOUNT_MESSAGE).withLinkAccountCard().getResponse();
    }

    const title = Alexa.getSlotValue(handlerInput.requestEnvelope, "title")?.trim();
    if (!title) {
      const msg = "Sorry, I didn't catch what the task should be. Try saying, add a task to renew my license.";
      return handlerInput.responseBuilder.speak(msg).reprompt(msg).getResponse();
    }

    const dueDateRaw = Alexa.getSlotValue(handlerInput.requestEnvelope, "dueDate");
    const dueTimeRaw = Alexa.getSlotValue(handlerInput.requestEnvelope, "dueTime");
    const dueDate = dueDateRaw ? normalizeDate(dueDateRaw) : undefined;
    const dueTime = normalizeTime(dueTimeRaw);

    try {
      await callApi(token, "/tasks", "POST", {
        title,
        dueDate,
        dueTime,
        suggestPriority: true,
      });
      const when = dueDate ? ` due ${dueDate === today() ? "today" : dueDate}` : "";
      return handlerInput.responseBuilder.speak(`Added the task: ${title}${when}.`).getResponse();
    } catch (err) {
      console.error("CreateTaskIntent failed:", err);
      const msg = "Sorry, I couldn't add that task right now. Please try again later.";
      return handlerInput.responseBuilder.speak(msg).getResponse();
    }
  },
};

const GetScheduleIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "GetScheduleIntent"
    );
  },
  async handle(handlerInput): Promise<Response> {
    const token = getAccessToken(handlerInput);
    if (!token) {
      return handlerInput.responseBuilder.speak(LINK_ACCOUNT_MESSAGE).withLinkAccountCard().getResponse();
    }

    const date = normalizeDate(Alexa.getSlotValue(handlerInput.requestEnvelope, "date"));
    const dayLabel = date === today() ? "today" : `on ${date}`;

    try {
      const schedule = await callApi<{ tasks: Task[]; habits: HabitLog[] }>(
        token,
        `/schedule/${date}`,
        "GET",
      );
      if (schedule.tasks.length === 0) {
        return handlerInput.responseBuilder.speak(`Nothing due ${dayLabel}.`).getResponse();
      }
      const names = schedule.tasks.slice(0, 5).map((t) => t.title).join(", ");
      const more = schedule.tasks.length > 5 ? `, and ${schedule.tasks.length - 5} more` : "";
      return handlerInput.responseBuilder
        .speak(`You have ${schedule.tasks.length} task${schedule.tasks.length === 1 ? "" : "s"} ${dayLabel}: ${names}${more}.`)
        .getResponse();
    } catch (err) {
      console.error("GetScheduleIntent failed:", err);
      const msg = "Sorry, I couldn't get your schedule right now. Please try again later.";
      return handlerInput.responseBuilder.speak(msg).getResponse();
    }
  },
};

const GetTasksIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "GetTasksIntent"
    );
  },
  async handle(handlerInput): Promise<Response> {
    const token = getAccessToken(handlerInput);
    if (!token) {
      return handlerInput.responseBuilder.speak(LINK_ACCOUNT_MESSAGE).withLinkAccountCard().getResponse();
    }

    try {
      const { tasks } = await callApi<{ tasks: Task[] }>(token, "/tasks", "GET");
      const pending = tasks.filter((t) => t.status !== "done");
      if (pending.length === 0) {
        return handlerInput.responseBuilder.speak("You have no pending tasks. Nice work.").getResponse();
      }
      const overdue = pending.filter((t) => t.dueDate && t.dueDate < today()).length;
      const overdueClause = overdue > 0 ? `, ${overdue} of them overdue` : "";
      return handlerInput.responseBuilder
        .speak(`You have ${pending.length} pending task${pending.length === 1 ? "" : "s"}${overdueClause}.`)
        .getResponse();
    } catch (err) {
      console.error("GetTasksIntent failed:", err);
      const msg = "Sorry, I couldn't get your tasks right now. Please try again later.";
      return handlerInput.responseBuilder.speak(msg).getResponse();
    }
  },
};

const HelpIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput): Response {
    const speakOutput =
      "You can say: log 500 milliliters of water, what's on my schedule today, " +
      "add a task to call the dentist tomorrow, or tell LifeOs I went for a run.";
    return handlerInput.responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();
  },
};

const CancelAndStopIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const intentName = requestType === "IntentRequest" ? Alexa.getIntentName(handlerInput.requestEnvelope) : "";
    return requestType === "IntentRequest" && (intentName === "AMAZON.CancelIntent" || intentName === "AMAZON.StopIntent");
  },
  handle(handlerInput): Response {
    return handlerInput.responseBuilder.speak("Goodbye.").getResponse();
  },
};

const SessionEndedRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "SessionEndedRequest";
  },
  handle(handlerInput): Response {
    return handlerInput.responseBuilder.getResponse();
  },
};

const CustomErrorHandler: ErrorHandler = {
  canHandle(): boolean {
    return true;
  },
  handle(handlerInput, error): Response {
    console.error("Unhandled error in alexaSkillHandler:", error);
    return handlerInput.responseBuilder
      .speak("Sorry, something went wrong. Please try again.")
      .reprompt("Please try again.")
      .getResponse();
  },
};

export const handler = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    LogHabitIntentHandler,
    DictateJournalIntentHandler,
    CreateTaskIntentHandler,
    GetScheduleIntentHandler,
    GetTasksIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(CustomErrorHandler)
  .lambda();
