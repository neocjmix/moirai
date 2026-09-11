"use client";

import { Theme } from "@radix-ui/themes";

import type {
  MoiraiGraphQueryResult,
  MoiraiGraphUrlState
} from "@moirai/contracts";

import type { AtroposScreenId } from "../lib/atropos-screen-registry";
import type {
  GraphDiagnostic,
  GraphRelationMatch,
  GraphSearchEntity,
  GraphSourceCatalog
} from "../lib/moirai-graph-source-query";
import { App, type AppProps } from "../urdr-port/src/App";
import { GraphQueryProvider } from "./graph-query-context";
import { NativeGraphViewport } from "./native-graph-viewport";

export function AtroposGraphRoot({
  initialScreen,
  initialGraphQuery,
  initialGraphResult,
  catalog,
  entities,
  relations,
  diagnostics
}: Readonly<{
  initialScreen: AtroposScreenId;
  initialGraphQuery: MoiraiGraphUrlState;
  initialGraphResult: MoiraiGraphQueryResult;
  catalog: GraphSourceCatalog;
  entities: readonly GraphSearchEntity[];
  relations: readonly GraphRelationMatch[];
  diagnostics: readonly GraphDiagnostic[];
}>) {
  const renderGraphPage: AppProps["renderGraphPage"] = ({ locale }) => (
    <NativeGraphViewport initialResult={initialGraphResult} locale={locale} />
  );
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
        <App initialScreen={initialScreen} renderGraphPage={renderGraphPage} />
      </Theme>
    </GraphQueryProvider>
  );
}
