import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { suggestTimelinePlacements } from "../../common/claude";

const MAX_ITEMS = 20;

interface Item {
  id: string;
  title: string;
  estimatedMinutes: number;
}

interface Gap {
  startMin: number;
  endMin: number;
}

function parseItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is Item =>
      !!i &&
      typeof i === "object" &&
      typeof (i as Record<string, unknown>).id === "string" &&
      typeof (i as Record<string, unknown>).title === "string" &&
      typeof (i as Record<string, unknown>).estimatedMinutes === "number" &&
      (i as Record<string, unknown>).estimatedMinutes as number > 0,
  );
}

function parseGaps(raw: unknown): Gap[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g): g is Gap => {
    if (!g || typeof g !== "object") return false;
    const { startMin, endMin } = g as Record<string, unknown>;
    return (
      Number.isInteger(startMin) &&
      Number.isInteger(endMin) &&
      (startMin as number) >= 0 &&
      (endMin as number) <= 1440 &&
      (startMin as number) < (endMin as number)
    );
  });
}

// Stateless: reads and writes nothing per-user, so there's no ownership check beyond requiring
// a valid sign-in. Every placement Claude proposes is re-checked here against the caller's own
// gaps before it goes back — the model's output is a proposal, never trusted directly.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const items = parseItems(body.items);
  if (items.length === 0 || items.length > MAX_ITEMS) {
    return errorResponse(400, `items must be a non-empty array of up to ${MAX_ITEMS} { id, title, estimatedMinutes }`);
  }

  const gaps = parseGaps(body.gaps);
  if (gaps.length === 0) {
    return errorResponse(400, "gaps must be a non-empty array of { startMin, endMin }");
  }

  let placements: { id: string; startMin: number }[];
  try {
    placements = await suggestTimelinePlacements(items, gaps);
  } catch (err) {
    console.error("Timeline suggestion failed:", err);
    return jsonResponse(200, { placements: [] });
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const safe = placements.filter((p) => {
    if (typeof p.id !== "string" || !Number.isInteger(p.startMin) || seen.has(p.id)) return false;
    const item = itemById.get(p.id);
    if (!item) return false;
    const end = p.startMin + item.estimatedMinutes;
    const fits = gaps.some((g) => p.startMin >= g.startMin && end <= g.endMin);
    if (!fits) return false;
    seen.add(p.id);
    return true;
  });

  return jsonResponse(200, { placements: safe });
};
