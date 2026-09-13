import { graphFallbackMarkup } from "../lib/graph-fallback-markup";

export function GraphQueryFallback(
  props: Parameters<typeof graphFallbackMarkup>[0]
) {
  return (
    <noscript
      dangerouslySetInnerHTML={{ __html: graphFallbackMarkup(props) }}
    />
  );
}
