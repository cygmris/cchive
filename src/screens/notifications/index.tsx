/**
 * Notifications — the real screen (replaces the S2 placeholder).
 *
 * One Card of three rows (design §12); each row = label + description + a "Test"
 * Button + a Switch, bound to {@link useNotifications}. Toggling a row installs or
 * removes a cchive-marked desktop-notification hook in `~/.claude/settings.json`
 * via {@link useSetNotification} (surgical: the user's own hooks + every other key
 * are preserved). "Test" fires a live desktop notification through the Tauri
 * notification plugin ({@link testNotification}, requesting permission first).
 *
 * No optimistic flip: each Switch reflects the real derived state from disk, and a
 * failed toggle leaves it untouched while surfacing the error as a toast. Outside
 * Tauri the query layer serves a labelled DEMO state and Test no-ops with a toast,
 * so the screen still renders in `vite dev` / the gallery. Tokens-only styling.
 */
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Switch } from "@/ui/Switch";
import { useTranslation } from "react-i18next";
import { useToast } from "@/ui/Toast";
import { ScreenHeader } from "@/app/ScreenHeader";
import { useNotifications, useSetNotification } from "@/lib/queries";
import { testNotification } from "@/lib/ipc";
import type { NotificationKind } from "@/lib/types";

/** The three notification rows, in design order (§12). */
const ROWS: ReadonlyArray<{
  kind: NotificationKind;
  label: string;
  description: string;
}> = [
  {
    kind: "completion",
    label: "Completion notifications",
    description: "Notify when Claude Code finishes a task",
  },
  {
    kind: "general",
    label: "General notifications",
    description: "Notify when Claude Code sends a message",
  },
  {
    kind: "toolUse",
    label: "Tool-use notifications",
    description: "Notify when Claude Code runs a tool",
  },
];

export function NotificationsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const notifications = useNotifications();
  const setNotification = useSetNotification();

  const state = notifications.data;
  // Without derived state yet (initial load) the controls stay inert rather than
  // flashing a wrong value.
  const ready = state != null;
  const pendingKind = setNotification.isPending
    ? setNotification.variables?.kind
    : undefined;

  function toggle(kind: NotificationKind, on: boolean) {
    setNotification.mutate(
      { kind, on },
      {
        // No optimistic update — the Switch re-derives from the invalidated
        // query on success; on failure it simply stays as it was.
        onError: (error) =>
          toast({
            title: on
              ? "Couldn't enable notifications"
              : "Couldn't disable notifications",
            description: error.message,
            variant: "danger",
          }),
      },
    );
  }

  async function test(kind: NotificationKind, label: string) {
    try {
      await testNotification(kind);
      toast({ title: "Test notification sent", description: label, variant: "success" });
    } catch (error) {
      toast({
        title: "Couldn't send a test notification",
        description: error instanceof Error ? error.message : String(error),
        variant: "warning",
      });
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <ScreenHeader
        title={t("header.notifications.title")}
        description={t("header.notifications.description")}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        <Card pad={0}>
          {ROWS.map((row, index) => {
            const enabled = ready ? state[row.kind] : false;
            const busy = pendingKind === row.kind;
            return (
              <div
                key={row.kind}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  padding: "16px var(--card-pad)",
                  borderTop:
                    index === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--fs-body)",
                      fontWeight: "var(--weight-semibold)",
                      color: "var(--text)",
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--fs-body-sm)",
                      color: "var(--text-2)",
                    }}
                  >
                    {row.description}
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Test ${row.label}`}
                  onClick={() => void test(row.kind, row.label)}
                >
                  Test
                </Button>

                <Switch
                  checked={enabled}
                  disabled={!ready || busy}
                  aria-label={row.label}
                  onChange={(next) => toggle(row.kind, next)}
                />
              </div>
            );
          })}
        </Card>

        <p
          style={{
            margin: 0,
            padding: "0 var(--space-1)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--text-3)",
          }}
        >
          Each toggle installs or removes a small cchive-marked command hook in{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>
            ~/.claude/settings.json
          </code>
          . Your existing hooks and other settings are left untouched. Restart your
          Claude Code session for changes to take effect.
        </p>
      </div>
    </div>
  );
}
