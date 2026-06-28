/**
 * ExperimentalScreen tests — the Agent Teams toggle is the only interactive
 * control: flipping it on persists the Clavis-local `experimental.agentTeams`
 * pref and reveals the "Teammate display mode" sub-row, whose Select persists
 * `experimental.teammateMode` on change.
 *
 * `@/lib/prefs` is mocked so the experimental slice is observable spies (NO
 * Claude Code files, no real store); the real `@/i18n` is imported so the
 * accessible names come from the English baseline.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/prefs", () => ({
  DEFAULT_EXPERIMENTAL_PREFS: { agentTeams: false, teammateMode: "auto" },
  getExperimentalPrefs: vi.fn(),
  setExperimentalPref: vi.fn(),
  // Consumed by @/i18n at import time.
  LANGUAGE_LS_KEY: "clavis.language",
  setLanguagePref: vi.fn(),
}));

import "@/i18n";
import * as prefs from "@/lib/prefs";
import { ExperimentalScreen } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
  (prefs.getExperimentalPrefs as Mock).mockResolvedValue({
    agentTeams: false,
    teammateMode: "auto",
  });
  (prefs.setExperimentalPref as Mock).mockResolvedValue(undefined);
});

describe("ExperimentalScreen", () => {
  it("hides the Teammate select until Agent Teams is on", async () => {
    render(<ExperimentalScreen />);

    // Wait for the hydrate effect to settle on the (off) default.
    await screen.findByText("Agent Teams");
    expect(
      screen.queryByLabelText("Teammate display mode"),
    ).not.toBeInTheDocument();
  });

  it("toggling Agent Teams on persists the flag and reveals the select", async () => {
    const user = userEvent.setup();
    render(<ExperimentalScreen />);

    const toggle = await screen.findByRole("switch", { name: "Agent Teams" });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    // The sub-row Select appears…
    expect(
      await screen.findByLabelText("Teammate display mode"),
    ).toBeInTheDocument();
    // …and the flip persisted the Clavis-local pref.
    await waitFor(() =>
      expect(prefs.setExperimentalPref).toHaveBeenCalledWith(
        "agentTeams",
        true,
      ),
    );
  });

  it("changing the Teammate mode persists teammateMode", async () => {
    const user = userEvent.setup();
    render(<ExperimentalScreen />);

    await user.click(await screen.findByRole("switch", { name: "Agent Teams" }));

    const select = await screen.findByLabelText("Teammate display mode");
    await user.selectOptions(select, "splitPanes");

    await waitFor(() =>
      expect(prefs.setExperimentalPref).toHaveBeenCalledWith(
        "teammateMode",
        "splitPanes",
      ),
    );
  });
});
