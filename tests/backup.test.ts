import { describe, expect, it } from "vitest";
import { validateBackupPayload } from "@/lib/backup";

const conversationId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";

function validBackup() {
  return {
    format: "helloai-export",
    version: 1,
    exportedAt: "2026-08-06T00:00:00.000Z",
    conversations: [{
      id: conversationId,
      title: "Test chat",
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
      pinned: false,
      archived: false,
      model: "gpt-5.6-terra",
      draft: "",
    }],
    messages: [{
      id: messageId,
      conversationId,
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
      createdAt: "2026-08-06T00:00:00.000Z",
      status: "complete",
    }],
    attachments: [],
  };
}

describe("validateBackupPayload", () => {
  it("accepts a referentially valid HelloAI backup", () => {
    expect(validateBackupPayload(JSON.stringify(validBackup())).conversations).toHaveLength(1);
  });

  it("rejects messages that reference unknown conversations", () => {
    const backup = validBackup();
    backup.messages[0].conversationId = "33333333-3333-4333-8333-333333333333";
    expect(() => validateBackupPayload(JSON.stringify(backup))).toThrow(/unknown conversation/i);
  });

  it("rejects malformed JSON with a useful message", () => {
    expect(() => validateBackupPayload("not-json")).toThrow(/valid JSON/i);
  });
});
