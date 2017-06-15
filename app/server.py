import json
from flask import Flask, render_template, redirect, send_from_directory, Response

import drive
import image
from cache import cache

app = Flask(__name__)


@cache(
    lambda *args: drive.file_meta(*args, fields=['id', 'version'])
)
def dl(drive_id):
    return drive.file_download(drive_id)


def dl_json(drive_id):
    return drive.file_json(drive_id)


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
    contents = drive.load_folder(drive_id)

    initial_data = json.dumps({'files': contents}, ensure_ascii=False)
    return render_template('index.html', initialData=initial_data)


@app.route('/file/<drive_id>')
def files(drive_id):
    try:
        data = drive.file_json(drive_id)
        if not data:
            return 'Not Found.', 404

        mime = data['mimeType']
        if not ('data' in data):
            data = drive.file_download(drive_id)

        return Response(data, mimetype=mime)
    except TypeError as e:
        print(e)
        return "Don't work. Sorry.", 400

    except Exception as e:
        print(e)
        return str(e), 400


if __name__ == '__main__':
    app.run()
