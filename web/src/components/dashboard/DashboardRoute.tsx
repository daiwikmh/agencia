import type { ComponentType } from "react";
import Shell from "./Shell.js";
import Catalog from "./panels/Catalog.js";
import Playground from "./panels/Playground.js";
import Graph from "./panels/Graph.js";
import Wallet from "./panels/Wallet.js";
import Budgets from "./panels/Budgets.js";
import Usage from "./panels/Usage.js";
import Audit from "./panels/Audit.js";
import type { Tab } from "./types.js";

const PANELS: Record<Tab, ComponentType> = {
  catalog: Catalog,
  playground: Playground,
  graph: Graph,
  wallet: Wallet,
  budgets: Budgets,
  usage: Usage,
  audit: Audit,
};

export default function DashboardRoute({ tab }: { tab: Tab }) {
  const Panel = PANELS[tab];
  return (
    <Shell active={tab}>
      <Panel />
    </Shell>
  );
}
