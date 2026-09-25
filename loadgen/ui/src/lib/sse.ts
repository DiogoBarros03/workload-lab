export type SseEvent = { event: string; data: unknown };

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return data.length ? { event, data: JSON.parse(data.join("\n")) } : null;
}

// Pure: callers feed back `rest` + the next chunk, so events may span chunks.
export function parseSse(text: string): { events: SseEvent[]; rest: string } {
  const blocks = text.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks.map(parseBlock).filter((e): e is SseEvent => e !== null);
  return { events, rest };
}
