import os
from redis import StrictRedis

redis_host = os.getenv('REDIS_HOST', 'localhost')
redis_port = os.getenv('REDIS_PORT', 6379)
redis_ttl = os.getenv('REDIS_TTL', 3600 * 24 * 7)

client = StrictRedis(host=redis_host, port=redis_port)


def key(id, version):
    return 'Drive_{id}_{v}'.format(id=id, v=version)


def redis_set(name, value):
    return client.setex(name, redis_ttl, value)


def redis_get(name):
    return client.get(name)


def cache(meta_fn):
    def wrap(fn):
        def wrapped_f(*args):
            meta = meta_fn(*args)
            name = key(**meta)
            cached_data = redis_get(name)
            if cached_data:
                return cached_data

            result = fn(*args)
            redis_set(name, result)
            return result

        return wrapped_f

    return wrap
