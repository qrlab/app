import os
import httplib2
from oauth2client.service_account import ServiceAccountCredentials
from apiclient import discovery

secrets_file = os.getenv('DRIVE_SECRETS', '../client_secrets.json')

scopes = ['https://www.googleapis.com/auth/drive']
credentials = ServiceAccountCredentials.from_json_keyfile_name(secrets_file, scopes=scopes)

http = credentials.authorize(httplib2.Http())
drive = discovery.build('drive', 'v3', http=http, cache_discovery=False)


def get_file_list(**kwargs):
    results = drive.files().list(**kwargs).execute()
    return results


def file_meta(file_id: str, fields: list):
    return drive.files().get(
        fileId=file_id,
        fields=','.join(fields)
    ).execute()


def file_download(file_id):
    return drive.files().get_media(fileId=file_id).execute()
