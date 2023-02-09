import { AssetId } from "caip";
import type { IPFS } from "ipfs-core-types";
import { CeramicApi } from "@ceramicnetwork/common";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { InvocationConfig } from "@web3-storage/upload-client";

import { API as RawAPI } from "./raw/index.js";

export type ParcelOptions = {
  parcelId: AssetId;
  ownerDID: string;
};

export type ConfigOptions = {
  ipfs: IPFS;
  ipfsGatewayHost?: string;
  ceramic: CeramicApi;
  w3InvocationConfig?: InvocationConfig;
};

export class GeoWebContent {
  raw: RawAPI;

  constructor(opts: ConfigOptions) {
    this.raw = new RawAPI(opts);
  }
}
