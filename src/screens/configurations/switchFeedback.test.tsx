/**
 * What a switch tells the user. The four freshen outcomes are not
 * interchangeable — "token refreshed" means ready to use, while a token we
 * could not refresh leaves Claude Code to retry — and two failures have a
 * specific remedy that the raw backend string does not spell out.
 */
import { describe, expect, it } from "vitest";
import { switchDescription, switchError } from "./AccountRow";
import type { FreshenStatus, SwitchResult } from "@/lib/types";

function result(
  status: FreshenStatus,
  detail: string | null = null,
  liveSessions = 0,
): SwitchResult {
  return {
    identity: {
      kind: "account",
      label: "b@example.test",
      email: "b@example.test",
      org: null,
      tier: null,
      model: null,
      expiresAt: null,
    },
    applyNote: "",
    freshen: { status, detail },
    liveSessions,
  };
}

describe("switch description", () => {
  it("says so when the token was refreshed", () => {
    expect(switchDescription("Work", result("refreshed"))).toBe(
      "Work · token refreshed",
    );
  });

  it("stays quiet when nothing needed doing", () => {
    expect(switchDescription("Work", result("notNeeded"))).toBe("Work");
    expect(switchDescription("Work", result("skippedActive"))).toBe("Work");
  });

  it("names the reason a refresh was skipped, and who retries", () => {
    const text = switchDescription(
      "Work",
      result("skippedTransient", "timed out"),
    );
    expect(text).toContain("timed out");
    expect(text).toContain("Claude Code will retry");
  });

  it("warns that running sessions stay on the previous account", () => {
    expect(switchDescription("Work", result("notNeeded", null, 1))).toContain(
      "1 Claude Code session is running",
    );
    expect(switchDescription("Work", result("notNeeded", null, 3))).toContain(
      "3 Claude Code sessions are running",
    );
  });
});

describe("switch error", () => {
  it("turns a rejected credential into a sign-in instruction", () => {
    const error = Object.assign(new Error("backend wording"), {
      code: "CREDENTIAL_DEAD",
    });
    const { title, description } = switchError("Work", error);
    expect(title).toContain("Work");
    expect(description).toMatch(/sign in/i);
    expect(description).toMatch(/capture it again/i);
  });

  it("explains a busy lock as a retry, and says nothing changed", () => {
    const error = Object.assign(
      new Error("another process holds Claude Code's credential lock: /x.lock"),
      { code: "LOCK_BUSY" },
    );
    const { title, description } = switchError("Work", error);
    expect(title).toBe("Claude Code is busy");
    expect(description).toMatch(/nothing was changed/i);
    // The lock path is noise to the user.
    expect(description).not.toContain("/x.lock");
  });

  it("falls back to the backend message for anything else", () => {
    const error = Object.assign(new Error("keyring unavailable"), {
      code: "KEYRING",
    });
    expect(switchError("Work", error)).toEqual({
      title: "Couldn't switch account",
      description: "keyring unavailable",
    });
  });
});
