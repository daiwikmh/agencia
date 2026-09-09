import Shell from "./Shell.js";
import Overview from "./panels/Overview.js";
import Fire from "./panels/Fire.js";
import Analytics from "./panels/Analytics.js";
import Manifest from "./panels/Manifest.js";
import Audit from "./panels/Audit.js";
import Session from "./panels/Session.js";
import type { ComponentType } from "react";
import type { Tab } from "./types.js";

const PANELS: Record<Tab, ComponentType> = {
  overview: Overview,
  fire: Fire,
  analytics: Analytics,
  manifest: Manifest,
  audit: Audit,
  session: Session,
};

export default function DashboardRoute({ tab }: { tab: Tab }) {
  const Panel = PANELS[tab];
  return (
    <Shell active={tab}>
      <Panel />
    </Shell>
  );
}
