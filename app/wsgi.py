# from server import app
# from app.server import app
from server import app as application

if __name__ == '__main__':
    application.run(host='0.0.0.0')
