import { AccountId, AssetId } from "caip";
import { Web3Storage } from "web3.storage";
import type { IPFS } from "ipfs-core-types";
import { CeramicApi } from "@ceramicnetwork/common";

import { API as RawAPI } from "./raw/index.js";

export type ParcelOptions = {
  parcelId: AssetId;
  ownerId: AccountId;
};

export type ConfigOptions = {
  ipfs: IPFS;
  ceramic: CeramicApi;
  web3Storage?: Web3Storage;
};

export class GeoWebContent {
  raw: RawAPI;

  constructor(opts: ConfigOptions) {
    this.raw = new RawAPI(opts);
  }
}
