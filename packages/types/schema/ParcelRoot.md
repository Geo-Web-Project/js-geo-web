# ParcelRoot

The root IPLD object attached to a parcel.

## IPLD Schema

```ipldsch
type ParcelRoot struct {
	basicProfile optional &BasicProfile
	mediaGallery optional &MediaGallery
}
```

## Browser Support

| Property       | [Geo Web Cadastre](https://github.com/Geo-Web-Project/cadastre) | [GeoWeb.app](https://geoweb.app) |
| -------------- | --------------------------------------------------------------- | -------------------------------- |
| `basicProfile` | ✅                                                              | ✅                               |
| `mediaGallery` | ✅                                                              | ✅                               |
