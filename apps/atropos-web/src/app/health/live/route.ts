import { GET as health } from "../route";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return health();
}
