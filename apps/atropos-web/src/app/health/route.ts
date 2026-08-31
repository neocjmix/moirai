import { GET as ready } from "./ready/route";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return ready();
}
