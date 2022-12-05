import { CID } from "multiformats/cid";

export type MediaGallery = CID[];

export interface MediaObject {
  name?: string;
  content: CID;
  contentSize?: number;
  encodingFormat: Encoding;
}

export type Encoding =
  | Encoding3DModel
  | EncodingImage
  | EncodingAudio
  | EncodingVideo;
export type Encoding3DModel = "Glb" | "Usdz";
export type EncodingImage = "Gif" | "Jpeg" | "Png" | "Svg";
export type EncodingAudio = "Mpeg" | "Mp4";
export type EncodingVideo = "Mpeg" | "Mp4";
