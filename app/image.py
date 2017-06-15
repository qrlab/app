import io
from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS

SIZE = (200, 200)


def jpegs_to_geojson(files):
    features = list(filter(
        lambda i: i,
        map(to_feature, files)
    ))

    return {
        'type': 'FeatureCollection',
        'crs': {
            'type': 'name',
            'properties': {
                'name': 'urn:ogc:def:crs:EPSG::3857'
            }
        },
        'features': features,
    }


def to_feature(file):
    coord = get_coord(file['data'])
    if not coord:
        return None

    meta = {
        **file,
        'fileUrl': '/file/{}'.format(file['id'])
    }
    del meta['data']

    return {
        'type': 'Feature',
        'properties': meta,
        'geometry': {
            'type': 'Point',
            'coordinates': coord
        }
    }


def get_coord(image_data: bytes):
    image = Image.open(io.BytesIO(image_data))
    if not image:
        return None
    try:
        gps = get_exif_gps(image)
        return exif_gps_to_coord(gps) if gps else None
    except Exception as e:
        print(e)
        return None


def compose(*fns):
    def wrapper(value):
        result = value
        for f in fns:
            result = f(result)
        return result

    return wrapper


def get_exif_gps(img):
    tags = dict([
        (TAGS.get(k), v) for k, v in img._getexif().items()
    ])
    if 'GPSInfo' in tags:
        gps = tags['GPSInfo']
        return dict([(GPSTAGS.get(k), v) for k, v in gps.items()])
    else:
        return None


def exif_gps_to_coord(exif):
    lon_m = 1 if exif['GPSLongitudeRef'] == 'E' else -1
    lat_m = 1 if exif['GPSLatitudeRef'] == 'N' else -1

    transform = compose(
        lambda name: exif[name],
        lambda angle: tuple(map(lambda i: i[0] / i[1], angle)),
        lambda i: i[0] + (i[1] / 60.0) + (i[2] / 3600.0),
    )

    lon = lon_m * transform('GPSLongitude')
    lat = lat_m * transform('GPSLatitude')
    return lon, lat


def thumbnail(image_data: bytes):
    image = Image.open(io.BytesIO(image_data))
    thumb = ImageOps.fit(image, SIZE, Image.ANTIALIAS)

    byte_array = io.BytesIO()
    thumb.save(byte_array, format='JPEG')
    return byte_array.getvalue()
