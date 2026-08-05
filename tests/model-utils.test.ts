import { describe, expect, it } from "vitest";
import { MODEL_PATTERN, parseModelList } from "@/lib/model-utils";

describe("model configuration", () => {
  it("normalizes and de-duplicates model lists", () => {
    expect(parseModelList(" gpt-5.6-terra, gpt-5.4-mini,gpt-5.6-terra ")).toEqual(["gpt-5.6-terra", "gpt-5.4-mini"]);
  });

  it("uses a fallback when no valid values exist", () => {
    expect(parseModelList("bad model,", ["gpt-5.4-mini"])).toEqual(["gpt-5.4-mini"]);
  });

  it("accepts only gateway-safe identifiers", () => {
    expect(MODEL_PATTERN.test("gpt-5.6-terra")).toBe(true);
    expect(MODEL_PATTERN.test("../secret")).toBe(false);
    expect(MODEL_PATTERN.test("model with spaces")).toBe(false);
  });
});
