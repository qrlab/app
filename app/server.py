import json
from flask import Flask, render_template, redirect, send_from_directory

import drive
from cache import cache

app = Flask(__name__)


@cache(
    lambda *args: drive.file_meta(*args, fields=['id', 'version'])
)
def dl(drive_id):
    return drive.file_download(drive_id)


def to_str(data):
    return data.decode() if data else None


@app.route('/')
def index():
    return redirect('/maps', code=302)


@app.route('/public/<path:path>')
def serve_static(path):
    return send_from_directory('../static', path)


@app.route('/maps')
def maps_empty():
    initial_data = {}
    return render_template('index.html', initialData=initial_data)


@app.route('/maps/<drive_id>')
def maps(drive_id):
    response = drive.get_file_list(
        q="'{id}' in parents and fileExtension='gpx'".format(id=drive_id),
        fields="files(id,version,name)"
    )
    files = response['files']
    contents = [{**f, 'data': to_str(dl(f['id']))} for f in files]

    initial_data = json.dumps({'files': contents}, ensure_ascii=False)
    return render_template('index.html', initialData=initial_data)


if __name__ == '__main__':
    app.run()
