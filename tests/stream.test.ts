import { describe, expect, it } from "vitest";
import { parseEventData } from "@/lib/stream";

describe("gateway stream parser", () => {
  it("extracts Responses API text deltas", () => {
    let text = "";
    parseEventData(JSON.stringify({ type: "response.output_text.delta", delta: "Hello" }), { onText: (delta) => { text += delta; } });
    expect(text).toBe("Hello");
  });

  it("extracts completion metadata", () => {
    let meta = {};
    parseEventData(JSON.stringify({ type: "response.completed", response: { id: "resp_1", model: "gpt-5.6-terra", usage: { input_tokens: 12, output_tokens: 8 } } }), {
      onText: () => undefined,
      onMeta: (value) => { meta = value; },
    });
    expect(meta).toEqual({ responseId: "resp_1", model: "gpt-5.6-terra", inputTokens: 12, outputTokens: 8 });
  });

  it("ignores malformed events", () => {
    let called = false;
    parseEventData("not-json", { onText: () => { called = true; } });
    expect(called).toBe(false);
  });
});
