/**
 * AddAccountModal — the capture-this-account flow (design §15, reworked from the
 * sign-in card).
 *
 * Clavis does not run a browser OAuth handshake; instead it captures whichever
 * account is *currently logged into Claude Code on this machine* into the vault.
 * The copy is explicit about that, and about how to add a DIFFERENT account (log
 * into it in Claude Code first, then capture again).
 *
 * "Capture current account" calls {@link useAddCurrentAccount}; on success it
 * toasts the captured email + tier and closes. If the email was already saved
 * the toast says "updated" instead of "added". Open state is the shared
 * `addAccountOpen` store flag, so both the Configurations screen and the sidebar
 * switcher's "Sign in" row drive this one mounted instance.
 */
import { Button } from "@/ui/Button";
import { Modal } from "@/ui/Modal";
import { LogoTile } from "@/ui/Logo";
import { useToast } from "@/ui/Toast";
import { useAccounts, useAddCurrentAccount } from "@/lib/queries";
import { useShellStore } from "@/lib/store";

export function AddAccountModal() {
  const { toast } = useToast();
  const open = useShellStore((s) => s.addAccountOpen);
  const close = useShellStore((s) => s.closeAddAccount);
  const accounts = useAccounts();
  const addCurrent = useAddCurrentAccount();

  function capture() {
    const knownEmails = new Set(
      (accounts.data ?? []).map((a) => a.email).filter((e): e is string => e != null),
    );
    addCurrent.mutate(undefined, {
      onSuccess: (meta) => {
        const updated = meta.email != null && knownEmails.has(meta.email);
        const detail = [meta.email ?? meta.label, meta.tier]
          .filter(Boolean)
          .join(" · ");
        toast({
          title: updated ? "Account updated" : "Account added",
          description: detail,
          variant: "success",
        });
        close();
      },
      onError: (error) =>
        toast({
          title: "Couldn't capture account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      showClose
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={capture} loading={addCurrent.isPending}>
            Capture current account
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3_5)" }}>
        <LogoTile size={44} />
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-title)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--ls-title)",
              color: "var(--text)",
            }}
          >
            Add this account
          </h2>
          <p
            style={{
              margin: "var(--space-2) 0 0",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body)",
              lineHeight: "var(--lh-body)",
              color: "var(--text-2)",
            }}
          >
            Clavis captures the Claude account currently logged into Claude Code on
            this machine and saves it to your keyring.
          </p>
          <p
            style={{
              margin: "var(--space-3) 0 0",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              lineHeight: "var(--lh-body-sm)",
              color: "var(--text-3)",
            }}
          >
            To add a different account, log into it in Claude Code first, then
            capture again.
          </p>
        </div>
      </div>
    </Modal>
  );
}
