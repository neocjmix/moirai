import { expect, it } from "vitest";
import {
  observePublicationRead,
  profilePublication,
  profilePublicationRoute
} from "./publication-profile";
it("isolates concurrent requests while counting nested reads in their parent", async () => {
  const read = (body: string) =>
    observePublicationRead(async () => {
      await Promise.resolve();
      return { body };
    });
  const [a, b] = await Promise.all([
    profilePublication(async () => {
      await read("가");
      return profilePublication(() => read("ab"));
    }),
    profilePublication(() => read("xyz"))
  ]);
  expect(a.metrics).toMatchObject({ objects: 2, bytes: 5 });
  expect(a.value.metrics).toMatchObject({ objects: 1, bytes: 2 });
  expect(b.metrics).toMatchObject({ objects: 1, bytes: 3 });
  const response = await profilePublicationRoute(async () => {
    await read("private-shaped content");
    return Response.json({ ok: true });
  })(new Request("https://example.org"));
  expect(response.headers.get("server-timing")).toMatch(/objects;desc="1"/);
  expect(response.headers.get("server-timing")).not.toContain("private-shaped");
});
