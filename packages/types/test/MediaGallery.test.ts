import { MediaGallery, MediaObject, schema } from "../src";
import { CID } from "multiformats/cid";
// @ts-ignore
import { create } from "@ipld/schema/typed.js";

describe("MediaGallery", () => {
  test("typed", async () => {
    const data: MediaGallery = [
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"),
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"),
    ];
    const schemaTyped = create(schema, "MediaGallery");
    const typedData = schemaTyped.toTyped(data);

    expect(typedData).toBeDefined();
    expect(typedData).toEqual(data);
  }, 30000);
});

describe("MediaObject3DModel", () => {
  test("typed", async () => {
    const data = {
      content: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
      encodingFormat: "model/gltf-binary",
    };
    const expected: MediaObject = {
      content: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
      encodingFormat: "Glb",
    };
    const schemaTyped = create(schema, "MediaObject3DModel");
    const typedData = schemaTyped.toTyped(data);

    expect(typedData).toBeDefined();
    expect(typedData).toEqual(expected);
  }, 30000);
});

describe("MediaObject", () => {
  test("typed", async () => {
    const data = {
      mediaType: "3DModel",
      content: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
      encodingFormat: "model/gltf-binary",
    };
    const expected: MediaObject = {
      content: CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ),
      encodingFormat: "Glb",
    };
    const schemaTyped = create(schema, "MediaObject");
    const typedData = schemaTyped.toTyped(data);

    expect(typedData).toBeDefined();
    expect(typedData["MediaObject3DModel"]).toEqual(expected);
  }, 30000);
});
