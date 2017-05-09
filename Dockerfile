FROM alpine:3.5

RUN apk add --no-cache python3 && \
    python3 -m ensurepip && \
    rm -r /usr/lib/python*/ensurepip && \
    pip3 install --upgrade pip setuptools && \
    rm -r /root/.cache

LABEL maintainer "Roman Timashev <roman@tmshv.ru>"

ENV INSTALL_PATH /app
RUN mkdir -p $INSTALL_PATH

COPY requirements.txt $INSTALL_PATH
RUN pip3 install -r $INSTALL_PATH/requirements.txt

COPY app $INSTALL_PATH/app
COPY static $INSTALL_PATH/static

VOLUME $INSTALL_PATH/client_secrets.json

ENV REDIS_HOST "redis"
ENV REDIS_PORT "6379"
ENV REDIS_TTL "3600"
ENV DRIVE_SECRETS "../client_secrets.json"

EXPOSE 5000

WORKDIR /$INSTALL_PATH/app
CMD gunicorn --bind 0.0.0.0:5000 wsgi
