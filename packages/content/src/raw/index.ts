// import { Web3Storage } from "web3.storage";
import type { IPFS } from "ipfs-core-types";
import { CeramicApi } from "@ceramicnetwork/common";
import { ConfigOptions, ParcelOptions } from "../index";
import { CID } from "multiformats";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { schema } from "@geo-web/types";
// @ts-ignore
import { create } from "@ipld/schema/typed.js";

type SchemaOptions = {
  schema?: string;
};

export class API {
  #ipfs: IPFS;
  #ceramic: CeramicApi;
  // #web3Storage: Web3Storage;

  constructor(opts: ConfigOptions) {
    this.#ipfs = opts.ipfs;
    this.#ceramic = opts.ceramic;
    // this.#web3Storage = opts.web3Storage;
  }

  /*
   * Resolve content root
   */
  async resolveRoot(opts: ParcelOptions): Promise<CID> {
    const doc = await TileDocument.deterministic<Record<string, any>>(
      this.#ceramic,
      {
        controllers: [`did:pkh:${opts.ownerId.toString()}`],
        family: `geo-web-parcel`,
        tags: [opts.parcelId.toString()],
      }
    );
    return CID.parse(doc.content["/"]);
  }

  /*
   * Retrieves IPLD object at path
   *  - Validates schema + transforms representation -> typed before read
   */
  async getPath(
    path: string,
    opts: ParcelOptions & SchemaOptions
  ): Promise<any> {
    const root = await this.resolveRoot(opts);
    const result = await this.#ipfs.dag.get(root, { path });

    if (opts.schema) {
      const schemaTyped = create(schema, opts.schema);
      return schemaTyped.toTyped(result.value);
    } else {
      return result.value;
    }
  }
  /*
   * Update CID at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   */
  async putCid(root: CID, path: string, cid: CID): Promise<CID> {
    // Base case, path is root
    if (path === "/" || path === "") {
      return cid;
    }

    // 1. Replace CID at first parent
    const pathSegments = path.split("/");
    const lastPathSegment = pathSegments[pathSegments.length - 1];
    const parentPath = path.replace(`/${lastPathSegment}`, "");
    const { value } = await this.#ipfs.dag.get(root, { path: parentPath });
    value[lastPathSegment] = cid;

    const newCid = await this.#ipfs.dag.put(value, {
      storeCodec: "dag-cbor",
    });

    // 2b. Replace parent CID recursively
    return this.putCid(root, parentPath, newCid);
  }

  /*
   * Update node at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   *  - Validates schema + transforms typed -> representation before write
   */
  // putPath(root: CID, path: string, data: any): CID {}

  /*
   * Delete node at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   *  - Validates schema + transforms typed -> representation before write
   */
  // deletePath(root: CID, path: string, data: any): CID {}

  /*
   * Commit new root to Ceramic
   *  - Pins CAR
   */
  // commit(root:CID, opts: ParcelOptions) {}
}
