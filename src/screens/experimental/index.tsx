import { ScreenPlaceholder } from "@/app/ScreenHeader";

/** Experimental screen (placeholder — real content lands in a later spec). */
export function ExperimentalScreen() {
  return (
    <ScreenPlaceholder
      title="Experimental"
      description="Early features that may change or disappear in future versions."
      label="Experimental"
    />
  );
}
