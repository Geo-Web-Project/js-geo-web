import type { IPFS } from "ipfs-core-types";
import { SyncOptions } from "@ceramicnetwork/common";
import { ConfigOptions, ParcelOptions } from "../index";
import { CID, varint } from "multiformats";
import { TileLoader } from "@glazed/tile-loader";
import { schema } from "@geo-web/types";
import * as json from "multiformats/codecs/json";
import * as dagjson from "@ipld/dag-json";
import * as Block from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagcbor from "@ipld/dag-cbor";
import { default as axios } from "axios";
import { ApolloClient, NormalizedCacheObject, gql } from "@apollo/client/core";
import { base16 } from "multiformats/bases/base16";
import contentHash from "@ensdomains/content-hash";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { InvocationConfig } from "@web3-storage/upload-client";
import { CAR, uploadCAR } from "@web3-storage/upload-client";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
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

const parcelQuery = gql`
  query GeoWebParcel($id: String) {
    geoWebParcel(id: $id) {
      contentHash
    }
  }
`;

export interface GeoWebParcel {
  contentHash?: string;
}

export interface ParcelQuery {
  geoWebParcel?: GeoWebParcel;
}

export class API {
  #ipfs: IPFS;
  #ipfsGatewayHost?: string;
  #w3InvocationConfig?: InvocationConfig;
  #tileLoader: TileLoader;
  #apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor(opts: ConfigOptions) {
    this.#ipfs = opts.ipfs;
    this.#ipfsGatewayHost = opts.ipfsGatewayHost;
    this.#w3InvocationConfig = opts.w3InvocationConfig;
    this.#tileLoader = new TileLoader({ ceramic: opts.ceramic, cache: true });
    this.#apolloClient = opts.apolloClient;
  }

  /*
   * Initialize empty content root
   */
  async initRoot(): Promise<string> {
    const emptyRoot = await this.#ipfs.dag.put({}, { storeCodec: "dag-cbor" });
    return await this.commit(emptyRoot);
  }

  /*
   * Resolve content root
   *
   * Fallbacks:
   * 1. Check for IPFS cid in subgraph
   * 2. Check TileDocument with EIP-55 checksum address
   * 3. Check TileDocument with lowercase address
   * 4. Empty root
   */
  async resolveRoot(opts: ParcelOptions): Promise<CID> {
    // 1. Subgraph
    const queryResult = await this.#apolloClient.query<ParcelQuery>({
      query: parcelQuery,
      variables: {
        id: Number(opts.parcelId.tokenId).toString(16),
      },
    });

    if (queryResult.data.geoWebParcel?.contentHash) {
      try {
        const codec = contentHash.getCodec(
          queryResult.data.geoWebParcel.contentHash
        );
        if (codec !== "ipfs-ns") {
          console.debug("Content hash is not IPFS CID");
        } else {
          return CID.parse(
            contentHash.decode(queryResult.data.geoWebParcel.contentHash)
          ).toV1();
        }
      } catch (e) {
        console.debug("Failed to find CID. Falling back to Ceramic: ", e);
      }
    } else {
      console.debug("CID does not exist on subgraph. Falling back to Ceramic.");
    }

    // 2. EIP-55 checksum address
    let doc = await this.#tileLoader.deterministic<Record<string, any>>(
      {
        controllers: [opts.ownerDID],
        family: `geo-web-parcel`,
        tags: [opts.parcelId.toString()],
      },
      { sync: SyncOptions.SYNC_ON_ERROR }
    );

    if (!doc.content || !doc.content["/"]) {
      // 3. Lowercase address
      doc = await this.#tileLoader.deterministic<Record<string, any>>(
        {
          controllers: [opts.ownerDID.toLowerCase()],
          family: `geo-web-parcel`,
          tags: [opts.parcelId.toString()],
        },
        { sync: SyncOptions.SYNC_ON_ERROR }
      );
    }

    if (doc.content && doc.content["/"]) {
      return CID.parse(doc.content["/"]);
    } else {
      // 4. Empty root
      const emptyRoot = await this.#ipfs.dag.put(
        {},
        { storeCodec: "dag-cbor" }
      );
      return emptyRoot;
    }
  }

  /*
   * Retrieves IPLD object at path from any root
   *  - Validates schema + transforms representation -> typed before read
   */
  async get(root: CID, path: string, opts: SchemaOptions): Promise<any> {
    let value: any;
    let timerId: ReturnType<typeof setTimeout>;

    const jsIpfsRequest = new Promise((resolve, reject) => {
      this.#ipfs.dag
        .get(root, { path })
        .then((result) => {
          if (timerId) {
            clearTimeout(timerId);
          }

          console.debug(`Found ${root.toString()}/${path} from IPFS get`);
          resolve(result.value);
        })
        .catch((err) => {
          console.warn(`IPFS get Error: `, err);
          if ((err as Error).message.includes("no link named")) {
            resolve(value);
          } else {
            reject(err);
          }
        });
    });
    const gatewayRequest = new Promise((resolve, reject) => {
      timerId = setTimeout(async () => {
        if (this.#ipfsGatewayHost) {
          let cid: CID | null = null;
          try {
            cid = (await this.#ipfs.dag.resolve(root, { path, timeout: 500 }))
              .cid;
            console.debug(`Found ${root.toString()}/${path} from IPFS resolve`);
          } catch (err) {
            console.warn(`IPFS resolve Error: `, err);
            if ((err as Error).message.includes("no link named")) {
              return value;
            }
          }

          try {
            const cidStr = cid ? cid.toString() : `${root.toString()}/${path}`;
            // Download raw block
            console.debug(
              `Retrieving raw block from: ${
                this.#ipfsGatewayHost
              }/ipfs/${cidStr}`
            );
            const rawBlock = await axios.get(
              `${this.#ipfsGatewayHost}/ipfs/${cidStr}`,
              {
                responseType: "arraybuffer",
                headers: { Accept: "application/vnd.ipld.raw" },
              }
            );
            const uintBuffer = new Uint8Array(rawBlock.data);
            const block = await Block.decode({
              bytes: uintBuffer,
              codec: dagcbor,
              hasher,
            });

            this.#ipfs.block.put(uintBuffer);

            resolve(block.value);
          } catch (e) {
            console.warn(`Could not retrieve raw block: ` + e);
            reject();
          }
        } else {
          console.info(`Skipping gateway lookup. ipfsGatewayHost not found`);
          reject();
        }
      }, 2000);
    });

    try {
      value = await Promise.any([jsIpfsRequest, gatewayRequest]);
    } catch (err) {
      console.warn(err);
    }

    if (opts.schema) {
      const schemaTyped = create(schema, opts.schema);
      return schemaTyped.toTyped(value);
    } else {
      return value;
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
    opts?: LeafSchemaOptions & PinOptions
  ): Promise<CID> {
    let newData = data;
    if (opts?.leafSchema) {
      const schemaTyped = create(schema, opts.leafSchema);
      newData = schemaTyped.toRepresentation(data);
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
      if (pathSegments.length === 2 && pathSegments[1] === "") {
        return node;
      }
      // Base case, one path left
      if (pathSegments.length === 1) {
        if (data == null) {
          delete node[pathSegments[0]];
        } else {
          node[pathSegments[0]] = data;
        }
        return node;
      }
      // Base case, one path left with /
      if (pathSegments.length === 2) {
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

    const innerBlocks = [];
    let newValue;
    if (remainderPath === "" || remainderPath === undefined) {
      // Replace leaf
      newValue = putInnerPath(value, `/${lastPathSegment}`, newData);
      // Filter undefined from arrays
      if (Array.isArray(newValue)) {
        newValue = newValue.filter((v) => v);
      }
      if (opts?.parentSchema) {
        const schemaTyped = create(schema, opts.parentSchema);
        let newDataRepresentation = schemaTyped.toRepresentation(newValue);
        if (newValue && newDataRepresentation === undefined) {
          // Try again with a Link
          const newDataLink = await this.#ipfs.dag.put(newData, {
            storeCodec: "dag-cbor",
          });
          const block = await Block.encode({
            value: newData,
            codec: dagcbor,
            hasher,
          });
          innerBlocks.push(block);
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
      // Filter undefined from arrays
      if (Array.isArray(newValue)) {
        newValue = newValue.filter((v) => v);
      }
      if (opts?.parentSchema) {
        const schemaTyped = create(schema, opts.parentSchema);
        let newDataRepresentation = schemaTyped.toRepresentation(newValue);
        if (newValue && newDataRepresentation === undefined) {
          // Try again with a Link
          const newDataLink = await this.#ipfs.dag.put(newData, {
            storeCodec: "dag-cbor",
          });
          const block = await Block.encode({
            value: newData,
            codec: dagcbor,
            hasher,
          });
          innerBlocks.push(block);
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

    if (opts?.pin) {
      if (!this.#w3InvocationConfig) {
        throw new Error("Web3Storage not configured");
      }

      // Build CAR
      const block = await Block.encode({
        value: newValue,
        codec: dagcbor,
        hasher,
      });

      try {
        const car = await CAR.encode([block, ...innerBlocks]);
        await uploadCAR(this.#w3InvocationConfig, car);
      } catch (e) {
        console.error(e);
        throw e;
      }
    }

    // 2a. Base case, path is root
    if (parentPath === "/" || parentPath === "") {
      return newCid;
    }

    // 2b. Replace parent CID recursively
    return this.putPath(root, parentPath, newCid, { pin: opts?.pin });
  }

  /*
   * Delete node at path and recursively update all parents from the leaf to the root.
   *  - Returns new root
   */
  async deletePath(
    root: CID,
    path: string,
    opts?: LeafSchemaOptions & PinOptions
  ): Promise<CID> {
    return await this.putPath(root, path, null, opts);
  }

  /*
   * Commit new root
   */
  async commit(root: CID): Promise<string> {
    // Return formatted content hash
    return `0x${contentHash.fromIpfs(root.toString())}`;
  }
}
