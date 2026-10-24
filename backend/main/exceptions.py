from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if isinstance(exc, Throttled) and response is not None:
        # DRF appends an English wait sentence; keep any custom text and say it in Indonesian.
        message = str(exc.detail).split(" Expected available in")[0]
        if message == str(Throttled.default_detail):
            message = "Terlalu banyak permintaan."
        if exc.wait is not None:
            message += f" Coba lagi dalam {exc.wait} detik."
        response.data["detail"] = message
    return response
