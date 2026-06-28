import { ScreenPlaceholder } from "@/app/ScreenHeader";
import { useShellStore } from "@/lib/store";

/**
 * Config Editor screen (placeholder — real content lands in a later spec).
 * Not a sidebar destination: reached from Configurations, so its header carries
 * a back link there (Configurations stays highlighted in the sidebar).
 */
export function ConfigEditorScreen() {
  const go = useShellStore((s) => s.go);
  return (
    <ScreenPlaceholder
      title="Config Editor"
      description="Edit one provider config's environment and settings."
      backLabel="Configurations"
      onBack={() => go("configs")}
      label="Config Editor"
    />
  );
}
