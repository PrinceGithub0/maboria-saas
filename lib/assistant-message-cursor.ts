export function decodeAssistantMessageCursor(value?: string | null) {
  const cursor = String(value || "").trim();
  return cursor.length > 0 ? cursor : null;
}
