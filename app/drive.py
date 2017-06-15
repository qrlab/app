import os
import httplib2
from googleapiclient.errors import HttpError
from oauth2client.service_account import ServiceAccountCredentials
from apiclient import discovery

import image
from cache import cache

secrets_file = os.getenv('DRIVE_SECRETS', '../client_secrets.json')

scopes = ['https://www.googleapis.com/auth/drive']
credentials = ServiceAccountCredentials.from_json_keyfile_name(secrets_file, scopes=scopes)

http = credentials.authorize(httplib2.Http())
drive = discovery.build('drive', 'v3', http=http, cache_discovery=False)

JPEG = 'image/jpeg'


def to_str(data):
    return data.decode() if data else None


def is_image(mime):
    return mime in [JPEG]


def is_folder(mime: str):
    return mime == 'application/vnd.google-apps.folder'


def get_file_list(**kwargs):
    results = drive.files().list(**kwargs).execute()
    return results


def file_meta(file_id: str, fields: list):
    return drive.files().get(
        fileId=file_id,
        fields=','.join(fields)
    ).execute()


def make_thumbnail():
    def wrap(fn):
        def wrapped_f(*args):
            data = fn(*args)
            try:
                return image.thumbnail(data)
            except Exception as e:
                print(e)
                return data

        return wrapped_f

    return wrap


@cache(
    lambda *args: file_meta(*args, fields=['id', 'version'])
)
def file_download(file_id):
    return drive.files().get_media(fileId=file_id).execute()


@make_thumbnail()
def file_download_www(file_id):
    return file_download(file_id)


def file_json(drive_id):
    try:
        meta = file_meta(drive_id, ['id', 'version', 'name', 'mimeType'])
        mime = meta['mimeType']
        if is_folder(mime):
            raise Exception('Cannot load a folder. Route /file accepts ids of files only.')
        meta['url'] = '/file/{}'.format(meta['id'])

        if is_image(mime):
            return meta
        else:
            content = file_download(drive_id)
            return {
                **meta,
                'data': to_str(content),
            }

    except HttpError:
        return None


def load_folder(drive_id):
    exts = map(
        lambda e: "fileExtension='{}'".format(e),
        ['gpx', 'geojson', 'json', 'jpg']
    )

    res = get_file_list(
        q="'{id}' in parents and ({exts})".format(id=drive_id, exts=' or '.join(exts)),
        fields="files(id,version,name,mimeType)"
    )

    files = res['files']
    jpegs = list(filter(
        lambda file: file['mimeType'] == JPEG,
        files
    ))
    # jpegs = jpegs[2:3]
    jpegs = [{**f, 'data': file_download(f['id'])} for f in jpegs]
    jpeg_virtual = create_virtual_file_from_images(jpegs)

    files = list(filter(
        lambda file: file['mimeType'] != JPEG,
        files
    ))
    files = [file_json(f['id']) for f in files]

    if jpeg_virtual:
        files.append(jpeg_virtual)
    return files


def create_virtual_file_from_images(files):
    if not len(files):
        return None

    jpeg_virtual = image.jpegs_to_geojson(files)

    return {
        'name': 'generated.images.geojson',
        'data': jpeg_virtual
    }

