"use client";

import { Theme } from "@radix-ui/themes";

import type { MoiraiGraphUrlState } from "@moirai/contracts";

import type { AtroposScreenId } from "../lib/atropos-screen-registry";
import { App } from "../urdr-port/src/App";
import { GraphQueryProvider } from "./graph-query-context";
import type {
  GraphDiagnostic,
  GraphRelationMatch,
  GraphSearchEntity,
  GraphSourceCatalog
} from "../lib/moirai-graph-source-query";

export function AtroposGraphRoot({
  initialScreen,
  initialGraphQuery,
  catalog,
  entities,
  relations,
  diagnostics
}: Readonly<{
  initialScreen: AtroposScreenId;
  initialGraphQuery: MoiraiGraphUrlState;
  catalog: GraphSourceCatalog;
  entities: readonly GraphSearchEntity[];
  relations: readonly GraphRelationMatch[];
  diagnostics: readonly GraphDiagnostic[];
}>) {
  return (
    <GraphQueryProvider
      catalog={catalog}
      diagnostics={diagnostics}
      entities={entities}
      initialState={initialGraphQuery}
      relations={relations}
    >
      <Theme
        accentColor="gray"
        appearance="light"
        grayColor="sage"
        radius="large"
        scaling="100%"
      >
        <App initialScreen={initialScreen} />
      </Theme>
    </GraphQueryProvider>
  );
}
