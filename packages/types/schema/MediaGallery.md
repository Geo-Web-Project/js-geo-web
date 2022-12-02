# MediaGallery

A set of media objects, such as an image, video, audio, or 3D models.

## IPLD Schema

```ipldsch
type MediaGallery [&MediaObject]

type MediaObject union {
  | MediaObject3DModel "3DModel"
  | MediaObjectImage "ImageObject"
  | MediaObjectAudio "AudioObject"
  | MediaObjectVideo "VideoObject"
} representation inline {
  discriminantKey "mediaType"
}
```

### Media Objects

```ipldsch
type MediaObject3DModel struct {
  name optional String
  content &Bytes
  contentSize optional Integer
  encodingFormat Encoding3DModel
}

type MediaObjectImage struct {
  name optional String
  content &Bytes
  contentSize optional Integer
  encodingFormat EncodingImage
}

type MediaObjectAudio struct {
  name optional String
  content &Bytes
  contentSize optional Integer
  encodingFormat EncodingAudio
}

type MediaObjectVideo struct {
  name optional String
  content &Bytes
  contentSize optional Integer
  encodingFormat EncodingVideo
}
```

### Encodings

```ipldsch
type Encoding3DModel enum {
	| Glb ("model/gltf-binary")
	| Usdz ("model/vnd.usdz+zip")
}

type EncodingImage enum {
	| Gif ("image/gif")
	| Jpeg ("image/jpeg")
	| Png ("image/png")
	| Svg ("image/svg+xml")
}

type EncodingAudio enum {
	| Mpeg ("audio/mpeg")
	| Mp4 ("audio/mp4")
}

type EncodingVideo enum {
	| Mpeg ("video/mpeg")
	| Mp4 ("video/mp4")
}
```

## Browser Support

| Property         | [Geo Web Cadastre](https://github.com/Geo-Web-Project/cadastre) | [GeoWeb.app](https://geoweb.app) |
| ---------------- | --------------------------------------------------------------- | -------------------------------- |
| `name`           | ✅                                                              | ✅                               |
| `contentUrl`     | ✅                                                              | ✅                               |
| `contentSize`    | ❌                                                              | ❌                               |
| `encodingFormat` | ✅                                                              | ❌                               |

| Type          | Encoding             | [Geo Web Cadastre](https://github.com/Geo-Web-Project/cadastre) | [GeoWeb.app](https://geoweb.app) |
| ------------- | -------------------- | --------------------------------------------------------------- | -------------------------------- |
| `3DModel`     | `model/gltf-binary`  | ✅                                                              | ✅                               |
| `3DModel`     | `model/vnd.usdz+zip` | ✅                                                              | ❌                               |
| `ImageObject` | `image/gif`          | ✅                                                              | ❌                               |
| `ImageObject` | `image/jpeg`         | ✅                                                              | ❌                               |
| `ImageObject` | `image/png`          | ✅                                                              | ❌                               |
| `ImageObject` | `image/svg+xml`      | ✅                                                              | ❌                               |
| `AudioObject` | `audio/mpeg`         | ✅                                                              | ❌                               |
| `AudioObject` | `audio/mp4`          | ✅                                                              | ❌                               |
| `VideoObject` | `video/mpeg`         | ✅                                                              | ❌                               |
| `VideoObject` | `video/mp4`          | ✅                                                              | ❌                               |

## [Discussion](https://forum.geoweb.network/t/content-media-gallery-and-objects/61)
