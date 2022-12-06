import { ParcelRoot, schema } from "../src";
import { CID } from "multiformats/cid";
// @ts-ignore
import { create } from "@ipld/schema/typed.js";

describe("ParcelRoot", () => {
  test("typed", async () => {
    const data: ParcelRoot = {
      basicProfile: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
      mediaGallery: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
    };
    const schemaTyped = create(schema, "ParcelRoot");
    const typedData = schemaTyped.toTyped(data);

    expect(typedData).toBeDefined();
    expect(typedData).toEqual(data);
  }, 30000);
});
