import { BasicProfile } from "../src";
import { schema } from "../src";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { create } from "@ipld/schema/typed.js";

describe("BasicProfile", () => {
  test("typed", async () => {
    const data: BasicProfile = {
      name: "Hello",
      url: "http://example.com",
    };
    const schemaTyped = create(schema, "BasicProfile");
    const typedData = schemaTyped.toTyped(data);

    expect(typedData).toBeDefined();
    expect(typedData).toEqual(data);
  }, 30000);
});
