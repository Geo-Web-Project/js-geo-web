import { Web3Storage } from "web3.storage";
import type { IPFS } from "ipfs-core-types";
import { CeramicApi } from "@ceramicnetwork/common";
import { ConfigOptions, ParcelOptions } from "../index";
import { CID } from "multiformats";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { schema } from "@geo-web/types";
import * as json from "multiformats/codecs/json";
import * as dagjson from "@ipld/dag-json";
import { CarReader } from "@ipld/car";
// @ts-ignore
import { create } from "@ipld/schema/typed.js";

type SchemaOptions = {
  schema?: string;
};

type LeafSchemaOptions = {
  parentSchema?: string;
  leafSchema?: string;
};

type PinOptions = {
  pin?: boolean;
};

export class API {
  #ipfs: IPFS;
  #ceramic: CeramicApi;
  #web3Storage?: Web3Storage;

  constructor(opts: ConfigOptions) {
    this.#ipfs = opts.ipfs;
    this.#ceramic = opts.ceramic;
    this.#web3Storage = opts.web3Storage;
  }

  /*
   * Initialize empty content root
   */
  async initRoot(opts: ParcelOptions): Promise<void> {
    const emptyRoot = await this.#ipfs.dag.put({}, { storeCodec: "dag-cbor" });
    return await this.commit(emptyRoot, opts);
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
   * Retrieves IPLD object at path from any root
   *  - Validates schema + transforms representation -> typed before read
   */
  async get(root: CID, path: string, opts: SchemaOptions): Promise<any> {
    let result: any;
    try {
      result = await this.#ipfs.dag.get(root, { path, timeout: 2000 });
    } catch (e) {
      if (this.#web3Storage) {
        // Download DAG
        const res = await this.#web3Storage.get(root.toString());
        const buffer = await res!.arrayBuffer();
        const uintBuffer = new Uint8Array(buffer);
        const importResult = this.#ipfs.dag.import(
          (async function* () {
            yield uintBuffer;
          })()
        );

        for await (const _ of importResult) {
        }

        result = await this.#ipfs.dag.get(root, { path });
      }
    }

    if (opts.schema) {
      const schemaTyped = create(schema, opts.schema);
      return schemaTyped.toTyped(result.value);
    } else {
      return result.value;
    }
  }

  /*
   * Retrieves IPLD object at path from parcel root
   *  - Validates schema + transforms representation -> typed before read
   */
  async getPath(
    path: string,
    opts: ParcelOptions & SchemaOptions
  ): Promise<any> {
    const root = await this.resolveRoot(opts);

    return await this.get(root, path, opts);
  }

  /*
   * Update node at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   *  - Validates schema + transforms typed -> representation before write
   */
  async putPath(
    root: CID,
    path: string,
    data: any,
    opts?: LeafSchemaOptions
  ): Promise<CID> {
    let newData = data;
    if (opts?.leafSchema) {
      const schemaTyped = create(schema, opts.leafSchema);
      const newData = schemaTyped.toRepresentation(data);
      if (newData === undefined) {
        throw new TypeError("Invalid data form, does not match leafSchema");
      }
    }

    // 1. Replace CID at first parent
    const pathSegments = path.split("/");
    const lastPathSegment = pathSegments[pathSegments.length - 1];
    let parentPath = path.replace(`/${lastPathSegment}`, "");
    const { cid, remainderPath } = await this.#ipfs.dag.resolve(
      `/ipfs/${root.toString()}${parentPath}`
    );
    const { value } = await this.#ipfs.dag.get(cid);

    function putInnerPath(node: any, path: string, data: any): any {
      const pathSegments = path.split("/");

      // Base case, no path or root
      if (pathSegments.length == 2 && pathSegments[1] === "") {
        return node;
      }
      // Base case, one path left
      if (pathSegments.length == 1) {
        if (data == null) {
          delete node[pathSegments[0]];
        } else {
          node[pathSegments[0]] = data;
        }
        return node;
      }
      // Base case, one path left with /
      if (pathSegments.length == 2) {
        if (data == null) {
          delete node[pathSegments[1]];
        } else {
          node[pathSegments[1]] = data;
        }
        return node;
      }

      // Put on nested object
      node[pathSegments[1]] = putInnerPath(
        node[pathSegments[1]],
        pathSegments.slice(2).join("/"),
        data
      );
      return node;
    }

    let newValue;
    if (remainderPath === "" || remainderPath == undefined) {
      // Replace leaf
      newValue = putInnerPath(value, `/${lastPathSegment}`, newData);
      if (opts?.parentSchema) {
        const schemaTyped = create(schema, opts.parentSchema);
        let newDataRepresentation = schemaTyped.toRepresentation(newValue);
        if (newDataRepresentation === undefined) {
          // Try again with a Link
          const newDataLink = await this.#ipfs.dag.put(newData, {
            storeCodec: "dag-cbor",
          });
          newValue = putInnerPath(value, `/${lastPathSegment}`, newDataLink);
          newDataRepresentation = schemaTyped.toRepresentation(newValue);
          if (newDataRepresentation === undefined) {
            throw new TypeError(
              "Invalid data form, does not match parentSchema"
            );
          }
        }
      }
    } else {
      // Replace nested leaf
      const nestedPath = `/${remainderPath}/${lastPathSegment}`;
      newValue = putInnerPath(value, nestedPath, newData);
      if (opts?.parentSchema) {
        const schemaTyped = create(schema, opts.parentSchema);
        let newDataRepresentation = schemaTyped.toRepresentation(newValue);
        if (newDataRepresentation === undefined) {
          // Try again with a Link
          const newDataLink = await this.#ipfs.dag.put(newData, {
            storeCodec: "dag-cbor",
          });
          newValue = putInnerPath(value, nestedPath, newDataLink);
          newDataRepresentation = schemaTyped.toRepresentation(newValue);
          if (newDataRepresentation === undefined) {
            throw new TypeError(
              "Invalid data form, does not match parentSchema"
            );
          }
        }
      }

      parentPath = parentPath.replace(remainderPath, "");
    }

    const newCid = await this.#ipfs.dag.put(newValue, {
      storeCodec: "dag-cbor",
    });

    // 2a. Base case, path is root
    if (parentPath === "/" || parentPath === "") {
      return newCid;
    }

    // 2b. Replace parent CID recursively
    return this.putPath(root, parentPath, newCid);
  }

  /*
   * Delete node at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   */
  async deletePath(root: CID, path: string): Promise<CID> {
    return await this.putPath(root, path, null);
  }

  /*
   * Commit new root to Ceramic
   */
  async commit(root: CID, opts: ParcelOptions & PinOptions): Promise<void> {
    const doc = await TileDocument.deterministic<Record<string, any>>(
      this.#ceramic,
      {
        controllers: [`did:pkh:${opts.ownerId.toString()}`],
        family: `geo-web-parcel`,
        tags: [opts.parcelId.toString()],
      }
    );

    if (opts.pin == true) {
      if (!this.#web3Storage) {
        throw new Error("Web3Storage not configured");
      }
      // Pin entire DAG
      const car = this.#ipfs.dag.export(root);
      const reader = await CarReader.fromIterable(car);
      await this.#web3Storage?.putCar(reader);
    }

    // Commit to TileDocument
    const bytes = dagjson.encode(root);
    await doc.update(json.decode(bytes));
  }
}
