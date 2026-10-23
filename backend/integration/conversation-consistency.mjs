// Race test for backend-v1 CS2: does a conversation reopened right after a reply come back
// with its turns? Run it ONLY against a disposable staging stack with a disposable test user.
// It refuses to run against the real dev API. See integration/README.md.
//
// Each iteration sends one real chat message (this calls the model, so it costs money on a
// spend-capped key), then immediately reads the conversation back, and counts misses.

const REAL_DEV_API_ID = "yofhh85gua"; // the user's real dev HTTP API; never a valid test target

const required = ["LIFEOS_API_URL", "LIFEOS_CHAT_URL", "LIFEOS_ID_TOKEN"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}. See integration/README.md.`);
  process.exit(2);
}

const apiUrl = process.env.LIFEOS_API_URL.replace(/\/$/, "");
const chatUrl = process.env.LIFEOS_CHAT_URL;
const token = process.env.LIFEOS_ID_TOKEN;
const iterations = Number(process.env.ITERATIONS ?? 50);
const cleanup = process.env.CLEANUP === "1";

if (apiUrl.includes(REAL_DEV_API_ID) || chatUrl.includes(REAL_DEV_API_ID)) {
  console.error("Refusing to run: these URLs point at the real dev stack. Use the disposable staging stack.");
  process.exit(2);
}
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 200) {
  console.error("ITERATIONS must be an integer from 1 to 200.");
  process.exit(2);
}

const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Reads the NDJSON reply until "done" and returns the conversation id it reports.
async function sendMessage(message, conversationId) {
  const res = await fetch(chatUrl, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ message, conversationId, timezoneOffsetMinutes: 0 }),
  });
  if (!res.ok || !res.body) throw new Error(`chat request failed with HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneId;
  let failure;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "done") doneId = event.conversationId;
      if (event.type === "error") failure = event.message;
    }
  }
  if (failure) throw new Error(`assistant error: ${failure}`);
  if (!doneId) throw new Error("reply ended without a done event");
  return doneId;
}

// The same read the reopen screen makes. cache: no-store mirrors the frontend.
async function readConversation(conversationId) {
  const res = await fetch(`${apiUrl}/assistant/conversations/${conversationId}`, {
    headers: auth,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`conversation read failed with HTTP ${res.status}`);
  const data = await res.json();
  return data.turns ?? [];
}

async function deleteConversation(conversationId) {
  await fetch(`${apiUrl}/assistant/conversations/${conversationId}`, { method: "DELETE", headers: auth });
}

const created = [];
let empty = 0;
let missingAssistant = 0;
let errors = 0;

for (let i = 1; i <= iterations; i++) {
  try {
    const conversationId = await sendMessage(`race test message ${i}: reply with OK`, undefined);
    created.push(conversationId);
    // Read straight after "done", which is the window the bug lives in.
    const turns = await readConversation(conversationId);
    if (turns.length === 0) empty++;
    else if (!turns.some((t) => t.role === "assistant")) missingAssistant++;
  } catch (err) {
    errors++;
    console.error(`iteration ${i}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(JSON.stringify({ iterations, conversationsCreated: created.length, emptyReads: empty, missingAssistantTurn: missingAssistant, errors }, null, 2));
console.log("Expected after CS2 is deployed: emptyReads 0 and missingAssistantTurn 0.");

if (cleanup) {
  for (const id of created) await deleteConversation(id);
  console.log(`Deleted ${created.length} test conversations.`);
} else {
  console.log(`Left ${created.length} test conversations in the disposable account. Set CLEANUP=1 to delete them, or delete in the app.`);
}

process.exit(empty + missingAssistant + errors === 0 ? 0 : 1);
