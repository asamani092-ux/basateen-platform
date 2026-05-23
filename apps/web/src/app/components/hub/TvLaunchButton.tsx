import { Tv } from "lucide-react";
import { Button } from "../ui/button";
import { buildTvLaunchUrl } from "../../lib/tv-launch";
import { ds, tajawal } from "../../lib/design-system";

type TvLaunchButtonProps = {
  launchKey: string;
  sessionId?: number;
  label?: string;
};

export function TvLaunchButton({
  launchKey,
  sessionId,
  label = "بث شاشة التلفاز",
}: TvLaunchButtonProps) {
  function openTv() {
    const url = buildTvLaunchUrl(launchKey, sessionId);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      type="button"
      variant="default"
      className={ds.btnRound}
      onClick={openTv}
      style={tajawal}
    >
      <Tv className="w-4 h-4" />
      {label}
    </Button>
  );
}
