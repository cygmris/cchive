/**
 * Usage screen tests — the four stat tiles render the (mocked) aggregate, the
 * 30/7 range toggle re-queries with the matching day count, the refresh button
 * re-parses, the heatmap paints a cell per day, and an empty summary flows
 * through as zeros.
 *
 * `@tauri-apps/api/core` is mocked so the query layer takes the real backend
 * path, and `@/lib/ipc` is mocked so `read_usage` is an observable spy — the
 * screen exercises the real `useUsage` hook against a stubbed backend.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

vi.mock("@/lib/ipc", () => ({
  readUsage: vi.fn(),
  readGrokUsage: vi.fn(),
}));

import * as ipc from "@/lib/ipc";
import { UsageScreen } from "./index";
import { ThemeProvider } from "@/theme/ThemeProvider";
import type { GrokUsageSummary, UsageSummary } from "@/lib/types";

const SUMMARY: UsageSummary = {
  rangeDays: 30,
  totals: {
    input: 84_200_000,
    output: 12_500_000,
    cacheCreation: 6_000_000,
    cacheRead: 250_000_000,
  },
  estCostUsd: 128.4,
  unknownModels: [],
  perDay: [
    { date: "2026-06-26", output: 4_000_000, input: 28_000_000, cacheRead: 80_000_000 },
    { date: "2026-06-27", output: 3_500_000, input: 26_000_000, cacheRead: 85_000_000 },
    { date: "2026-06-28", output: 5_000_000, input: 30_000_000, cacheRead: 85_000_000 },
  ],
  perModel: [{ model: "claude-sonnet-4-5", tokens: 352_700_000 }],
  heatmap: [
    { date: "2026-06-24", tokens: 0, level: 0 },
    { date: "2026-06-25", tokens: 120_000, level: 1 },
    { date: "2026-06-26", tokens: 4_000_000, level: 3 },
    { date: "2026-06-27", tokens: 3_500_000, level: 2 },
    { date: "2026-06-28", tokens: 5_000_000, level: 4 },
  ],
};

const GROK_SUMMARY: GrokUsageSummary = {
  rangeDays: 30,
  credits: {
    percent: 73,
    periodStart: "2026-08-30T15:02:43Z",
    periodEnd: "2026-09-06T15:02:43Z",
    periodType: "USAGE_PERIOD_TYPE_WEEKLY",
    asOf: "2026-09-06T12:00:00Z",
    ageMinutes: 3,
    subscriptionTier: "SuperGrok Heavy",
  },
  totals: {
    costUsd: 12.5,
    tokens: 4_200_000,
    input: 3_800_000,
    output: 400_000,
    cacheRead: 2_000_000,
    calls: 48,
  },
  perDay: [{ date: "2026-09-06", costUsd: 8.4, tokens: 2_800_000, calls: 32 }],
  perModel: [{ model: "grok-4.6-build", costUsd: 10.2, tokens: 0, calls: 40 }],
  heatmap: [{ date: "2026-09-06", tokens: 2_800_000, level: 4 }],
};

const EMPTY: UsageSummary = {
  rangeDays: 30,
  totals: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
  estCostUsd: 0,
  unknownModels: [],
  perDay: [],
  perModel: [],
  heatmap: [],
};

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <UsageScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (ipc.readUsage as Mock).mockResolvedValue(SUMMARY);
  (ipc.readGrokUsage as Mock).mockResolvedValue(GROK_SUMMARY);
});

describe("UsageScreen", () => {
  it("renders the four stat tiles from the mocked summary", async () => {
    renderScreen();

    expect(await screen.findByText("Input tokens")).toBeInTheDocument();
    expect(screen.getByText("Output tokens")).toBeInTheDocument();
    expect(screen.getByText("Cache read")).toBeInTheDocument();
    expect(screen.getByText("Est. cost")).toBeInTheDocument();

    expect(screen.getByText("84.2M")).toBeInTheDocument();
    expect(screen.getByText("12.5M")).toBeInTheDocument();
    expect(screen.getByText("250.0M")).toBeInTheDocument();
    expect(screen.getByText("$128.40")).toBeInTheDocument();
  });

  it("queries each range window on toggle, and serves a recent window from cache", async () => {
    const user = userEvent.setup();
    renderScreen();

    // Initial mount queries the default 30-day window.
    await screen.findByText("Input tokens");
    await waitFor(() => expect(ipc.readUsage).toHaveBeenCalledWith(30));

    // A new window (7 days) triggers a fresh parse.
    await user.click(screen.getByRole("radio", { name: "7 days" }));
    await waitFor(() => expect(ipc.readUsage).toHaveBeenCalledWith(7));

    // Returning to the just-parsed 30-day window is served from cache within the
    // stale window — no second parse of the (potentially huge) logs. Explicit
    // refresh (its own test) is how you force a re-parse.
    await user.click(screen.getByRole("radio", { name: "30 days" }));
    await new Promise((r) => setTimeout(r, 50));
    const thirtyCalls = (ipc.readUsage as Mock).mock.calls.filter(
      (c) => c[0] === 30,
    ).length;
    expect(thirtyCalls).toBe(1);
  });

  it("refresh re-parses the logs", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Input tokens");
    const before = (ipc.readUsage as Mock).mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Refresh usage" }));

    await waitFor(() =>
      expect((ipc.readUsage as Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("renders a heatmap cell per day", async () => {
    const { container } = renderScreen();

    await screen.findByText("Input tokens");

    const grid = await waitFor(() => {
      const svg = container.querySelector('svg[aria-label*="heatmap"]');
      expect(svg).not.toBeNull();
      return svg as SVGSVGElement;
    });
    expect(grid.querySelectorAll("rect")).toHaveLength(SUMMARY.heatmap.length);
  });

  it("shows zeros for an empty summary", async () => {
    (ipc.readUsage as Mock).mockResolvedValue(EMPTY);
    renderScreen();

    await screen.findByText("Input tokens");

    // input / output / cache-read tiles all read 0; cost reads $0.00.
    expect(screen.getAllByText("0")).toHaveLength(3);
    expect(screen.getByText("$0.00")).toBeInTheDocument();

    // No activity → an empty grid (no cells).
    expect(document.querySelector('svg[aria-label*="heatmap"]')).toBeNull();
  });

  it("toggles to Grok tiles from the mocked grok summary without mixing Claude totals", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Input tokens");
    expect(screen.getByText("84.2M")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Grok" }));

    expect(await screen.findByText("Tokens")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
    expect(screen.getByText("4.2M")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("grok-4.6-build")).toBeInTheDocument();
    expect(screen.getByText("73%")).toBeInTheDocument();
    expect(screen.getByText(/SuperGrok Heavy/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Weekly Grok credits" })).toBeInTheDocument();
    expect(screen.queryByText("Input tokens")).not.toBeInTheDocument();
    expect(screen.queryByText("84.2M")).not.toBeInTheDocument();
    expect(screen.queryByText("$128.40")).not.toBeInTheDocument();
  });

  it("shows the Claude|Grok toggle on the default Claude view", async () => {
    renderScreen();
    await screen.findByText("Input tokens");
    expect(screen.getByRole("radio", { name: "Grok" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7 days" })).toBeInTheDocument();
  });

  it("labels Grok credits stale when ageMinutes is over 45", async () => {
    const user = userEvent.setup();
    (ipc.readGrokUsage as Mock).mockResolvedValue({
      ...GROK_SUMMARY,
      credits: { ...GROK_SUMMARY.credits!, ageMinutes: 80 },
    });
    renderScreen();
    await screen.findByText("Input tokens");
    await user.click(screen.getByRole("radio", { name: "Grok" }));
    expect(await screen.findByText(/stale/)).toBeInTheDocument();
    expect(screen.getByText("73%")).toBeInTheDocument();
  });
});
