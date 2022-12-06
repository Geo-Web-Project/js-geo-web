/**
 * @jest-environment ceramic
 */
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { CeramicApi } from "@ceramicnetwork/common";
import type { IPFS } from "ipfs-core-types";
import { GeoWebContent } from "../src";
import { AccountId, AssetId } from "caip";
import { EventEmitter } from "events";
import { Wallet as EthereumWallet } from "@ethersproject/wallet";
import { fromString, toString } from "uint8arrays";
import { DIDSession } from "did-session";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { DID } from "dids";
import { getResolver } from "key-did-resolver";
import { EthereumNodeAuth } from "@didtools/pkh-ethereum";
import { AuthMethod } from "@didtools/cacao";
import { CID } from "multiformats/cid";
import * as json from "multiformats/codecs/json";
import * as dagjson from "@ipld/dag-json";
import { Web3Storage } from "web3.storage";

declare global {
  const ceramic: CeramicApi;
  const ipfs: IPFS;
}

class EthereumProvider extends EventEmitter {
  wallet: EthereumWallet;

  constructor(wallet: EthereumWallet) {
    super();
    this.wallet = wallet;
  }

  send(
    request: { method: string; params: Array<any> },
    callback: (err: Error | null | undefined, res?: any) => void
  ): void {
    if (request.method === "eth_chainId") {
      callback(null, { result: "1" });
    } else if (request.method === "personal_sign") {
      let message = request.params[0] as string;
      if (message.startsWith("0x")) {
        message = toString(fromString(message.slice(2), "base16"), "utf8");
      }
      callback(null, { result: this.wallet.signMessage(message) });
    } else {
      callback(new Error(`Unsupported method: ${request.method}`));
    }
  }
}

function createEthereumAuthMethod(mnemonic?: string): Promise<AuthMethod> {
  const wallet = mnemonic
    ? EthereumWallet.fromMnemonic(mnemonic)
    : EthereumWallet.createRandom();
  const provider = new EthereumProvider(wallet);
  const accountId = new AccountId({
    address: wallet.address.toLowerCase(),
    chainId: { namespace: "eip155", reference: "1" },
  });
  return Promise.resolve(
    EthereumNodeAuth.getAuthMethod(provider, accountId, "testapp")
  );
}

describe("resolveRoot", () => {
  beforeAll(async () => {
    const seed = new Uint8Array(32);
    const did = new DID({
      resolver: getResolver(),
      provider: new Ed25519Provider(seed),
    });
    ceramic.did = did;
  });

  test("should resolve root", async () => {
    const authMethod = await createEthereumAuthMethod();
    const session = await DIDSession.authorize(authMethod, {
      resources: [`ceramic://*`],
    });
    ceramic.did = session.did;

    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(session.did.parent.split("did:pkh:")[1])
    );
    // Create root
    const cid = CID.parse(
      "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
    );
    const bytes = dagjson.encode(cid);
    const doc = await TileDocument.deterministic<Record<string, any>>(ceramic, {
      controllers: [session.did.parent],
      family: `geo-web-parcel`,
      tags: [parcelId.toString()],
    });
    await doc.update(json.decode(bytes));

    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    expect(result).toEqual(cid);
  });
});

describe("getPath", () => {
  beforeAll(async () => {
    const seed = new Uint8Array(32);
    const did = new DID({
      resolver: getResolver(),
      provider: new Ed25519Provider(seed),
    });
    ceramic.did = did;

    const authMethod = await createEthereumAuthMethod();
    const session = await DIDSession.authorize(authMethod, {
      resources: [`ceramic://*`],
    });
    ceramic.did = session.did;

    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    // Create DAG
    const mediaGallery = [
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"),
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"),
    ];
    const basicProfile = {
      name: "Hello",
      url: "http://example.com",
    };

    const mediaGalleryCid = await ipfs.dag.put(mediaGallery, {
      storeCodec: "dag-cbor",
    });

    const basicProfileCid = await ipfs.dag.put(basicProfile, {
      storeCodec: "dag-cbor",
    });

    const parcelRoot = {
      basicProfile: basicProfileCid,
      mediaGallery: mediaGalleryCid,
    };

    const parcelRootCid = await ipfs.dag.put(parcelRoot, {
      storeCodec: "dag-cbor",
    });
    const bytes = dagjson.encode(parcelRootCid);
    const doc = await TileDocument.deterministic<Record<string, any>>(ceramic, {
      controllers: [session.did.parent],
      family: `geo-web-parcel`,
      tags: [parcelId.toString()],
    });
    await doc.update(json.decode(bytes));
  }, 30000);

  test("should get untyped root path", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.getPath("/", {
      ownerId,
      parcelId,
    });
    expect(result).toBeDefined();
  });

  test("should get typed root path", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.getPath("/", {
      ownerId,
      parcelId,
      schema: "ParcelRoot",
    });
    expect(result).toBeDefined();
  });

  test("should get typed path", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.getPath("/mediaGallery", {
      ownerId,
      parcelId,
      schema: "MediaGallery",
    });
    expect(result).toBeDefined();
  });

  test("should return undefined on invalid schema", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.getPath("/mediaGallery", {
      ownerId,
      parcelId,
      schema: "BasicProfile",
    });
    expect(result).toBeUndefined();
  });
});

describe("putPath", () => {
  beforeAll(async () => {
    const seed = new Uint8Array(32);
    const did = new DID({
      resolver: getResolver(),
      provider: new Ed25519Provider(seed),
    });
    ceramic.did = did;

    const authMethod = await createEthereumAuthMethod();
    const session = await DIDSession.authorize(authMethod, {
      resources: [`ceramic://*`],
    });
    ceramic.did = session.did;

    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    // Create DAG
    const objCid = await ipfs.dag.put(
      {},
      {
        storeCodec: "dag-cbor",
      }
    );
    const mediaGallery = [objCid];
    const basicProfile = {
      name: "Hello",
      url: "http://example.com",
    };

    const mediaGalleryCid = await ipfs.dag.put(mediaGallery, {
      storeCodec: "dag-cbor",
    });

    const basicProfileCid = await ipfs.dag.put(basicProfile, {
      storeCodec: "dag-cbor",
    });

    const parcelRoot = {
      basicProfile: basicProfileCid,
      mediaGallery: mediaGalleryCid,
    };

    const parcelRootCid = await ipfs.dag.put(parcelRoot, {
      storeCodec: "dag-cbor",
    });
    const bytes = dagjson.encode(parcelRootCid);
    const doc = await TileDocument.deterministic<Record<string, any>>(ceramic, {
      controllers: [session.did.parent],
      family: `geo-web-parcel`,
      tags: [parcelId.toString()],
    });
    await doc.update(json.decode(bytes));
  }, 30000);

  test("should put cid at long path", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.putPath(
      rootCid,
      "/mediaGallery/0",
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u")
    );

    const { value } = await ipfs.dag.get(result, { path: "/mediaGallery" });
    expect(value[0].toString()).toEqual(
      CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ).toString()
    );
  }, 30000);

  test("should put cid at short path", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.putPath(
      rootCid,
      "/mediaGallery",
      CID.parse("bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u")
    );

    const { value } = await ipfs.dag.get(result);
    expect(value["mediaGallery"].toString()).toEqual(
      CID.parse(
        "bafybeidskjjd4zmr7oh6ku6wp72vvbxyibcli2r6if3ocdcy7jjjusvl2u"
      ).toString()
    );
  }, 30000);

  test("should put inner path", async () => {
    const rootCid = await ipfs.dag.put({
      name: {
        inner: "Hello",
      },
    });

    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const result = await gwContent.raw.putPath(rootCid, "/name/inner", "World");

    const { value } = await ipfs.dag.get(result, { path: "/name/inner" });
    expect(value).toEqual("World");
  }, 30000);

  test("should put with schema", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.putPath(
      rootCid,
      "/basicProfile",
      {
        name: "Hello World",
      },
      { schema: "BasicProfile" }
    );

    const { value } = await ipfs.dag.get(result, {
      path: "/basicProfile/name",
    });
    expect(value).toEqual("Hello World");
  }, 30000);

  test.skip(
    "should pin",
    async () => {
      const parcelId = new AssetId(
        AssetId.parse(
          "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
        )
      );
      const ownerId = new AccountId(
        AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
      );
      const gwContent = new GeoWebContent({
        ceramic,
        ipfs,
        web3Storage: new Web3Storage({
          token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDUzODE4MUY1NDQzQzZkMzM3NjQ2Q2EyMDkxM2EyQmFGYkU4QjFDMjIiLCJpc3MiOiJ3ZWIzLXN0b3JhZ2UiLCJpYXQiOjE2NTY3MTIxMzE1ODAsIm5hbWUiOiJHZW8gV2ViIENhZGFzdHJlIn0.azuvRIjWQFUva3KAUeGlzd9dmK1M-KFxmTKA4kTn4pU",
        }),
      });

      const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
      const result = await gwContent.raw.putPath(
        rootCid,
        "/basicProfile",
        {
          name: "Hello World",
        },
        { schema: "BasicProfile" }
      );

      await gwContent.raw.commit(result, { ownerId, parcelId, pin: true });

      const newRootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
      expect(newRootCid.toString()).toEqual(result.toString());
    },
    30000
  );
});

describe("deletePath", () => {
  beforeAll(async () => {
    const seed = new Uint8Array(32);
    const did = new DID({
      resolver: getResolver(),
      provider: new Ed25519Provider(seed),
    });
    ceramic.did = did;

    const authMethod = await createEthereumAuthMethod();
    const session = await DIDSession.authorize(authMethod, {
      resources: [`ceramic://*`],
    });
    ceramic.did = session.did;

    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    // Create DAG
    const objCid = await ipfs.dag.put(
      {},
      {
        storeCodec: "dag-cbor",
      }
    );
    const mediaGallery = [objCid];
    const basicProfile = {
      name: "Hello",
      url: "http://example.com",
    };

    const mediaGalleryCid = await ipfs.dag.put(mediaGallery, {
      storeCodec: "dag-cbor",
    });

    const basicProfileCid = await ipfs.dag.put(basicProfile, {
      storeCodec: "dag-cbor",
    });

    const parcelRoot = {
      basicProfile: basicProfileCid,
      mediaGallery: mediaGalleryCid,
    };

    const parcelRootCid = await ipfs.dag.put(parcelRoot, {
      storeCodec: "dag-cbor",
    });
    const bytes = dagjson.encode(parcelRootCid);
    const doc = await TileDocument.deterministic<Record<string, any>>(ceramic, {
      controllers: [session.did.parent],
      family: `geo-web-parcel`,
      tags: [parcelId.toString()],
    });
    await doc.update(json.decode(bytes));
  }, 30000);

  test("should delete leaf", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.deletePath(
      rootCid,
      "/basicProfile/name"
    );

    const { value } = await ipfs.dag.get(result, { path: "/basicProfile" });
    expect(value["name"]).toBeUndefined();
  }, 30000);

  test("should delete node", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.deletePath(rootCid, "/basicProfile");

    const { value } = await ipfs.dag.get(result);
    expect(value["basicProfile"]).toBeUndefined();
  }, 30000);
});

describe("commit", () => {
  beforeAll(async () => {
    const seed = new Uint8Array(32);
    const did = new DID({
      resolver: getResolver(),
      provider: new Ed25519Provider(seed),
    });
    ceramic.did = did;

    const authMethod = await createEthereumAuthMethod();
    const session = await DIDSession.authorize(authMethod, {
      resources: [`ceramic://*`],
    });
    ceramic.did = session.did;

    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    // Create DAG
    const objCid = await ipfs.dag.put(
      {},
      {
        storeCodec: "dag-cbor",
      }
    );
    const mediaGallery = [objCid];
    const basicProfile = {
      name: "Hello",
      url: "http://example.com",
    };

    const mediaGalleryCid = await ipfs.dag.put(mediaGallery, {
      storeCodec: "dag-cbor",
    });

    const basicProfileCid = await ipfs.dag.put(basicProfile, {
      storeCodec: "dag-cbor",
    });

    const parcelRoot = {
      basicProfile: basicProfileCid,
      mediaGallery: mediaGalleryCid,
    };

    const parcelRootCid = await ipfs.dag.put(parcelRoot, {
      storeCodec: "dag-cbor",
    });
    const bytes = dagjson.encode(parcelRootCid);
    const doc = await TileDocument.deterministic<Record<string, any>>(ceramic, {
      controllers: [session.did.parent],
      family: `geo-web-parcel`,
      tags: [parcelId.toString()],
    });
    await doc.update(json.decode(bytes));
  }, 30000);

  test("should commit", async () => {
    const parcelId = new AssetId(
      AssetId.parse(
        "eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769"
      )
    );
    const ownerId = new AccountId(
      AccountId.parse(ceramic.did.parent.split("did:pkh:")[1])
    );
    const gwContent = new GeoWebContent({ ceramic, ipfs });

    const rootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    const result = await gwContent.raw.putPath(
      rootCid,
      "/basicProfile",
      {
        name: "Hello World",
      },
      { schema: "BasicProfile" }
    );

    await gwContent.raw.commit(result, { ownerId, parcelId });

    const newRootCid = await gwContent.raw.resolveRoot({ ownerId, parcelId });
    expect(newRootCid.toString()).toEqual(result.toString());
  }, 30000);
});
