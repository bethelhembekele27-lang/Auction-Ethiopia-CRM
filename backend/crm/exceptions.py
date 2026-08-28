from rest_framework.views import exception_handler as drf_default_exception_handler


def api_exception_handler(exc, context):
    """
    API_SPEC.md §12 requires every non-2xx response to look like:
        { "message": "..." }

    DRF's default error shapes don't match that out of the box — e.g. a
    serializer validation error normally comes back as
        {"username": ["This field is required."]}
    This handler runs DRF's normal error handling first (so status codes,
    permission checks, etc. all still work as expected), then flattens
    whatever it produced into the single-message shape the frontend's
    ApiError class reads (err.body.message).
    """
    response = drf_default_exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data

    if isinstance(detail, dict):
        if 'detail' in detail:
            message = str(detail['detail'])
        else:
            # First field's first error message, e.g.
            # {"username": ["This field is required."]} -> "This field is required."
            first_key = next(iter(detail)) if detail else None
            first_val = detail.get(first_key) if first_key else None
            if isinstance(first_val, list) and first_val:
                message = str(first_val[0])
            else:
                message = str(first_val) if first_val is not None else "Request failed."
    elif isinstance(detail, list) and detail:
        message = str(detail[0])
    else:
        message = str(detail)

    response.data = {"message": message}
    return response