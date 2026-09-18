import mimetypes
from storages.backends.s3 import S3Storage
from storages.utils import clean_name


class SimpleS3Storage(S3Storage):
    """
    Backblaze B2's S3-compatible endpoint appears to mishandle the
    "Expect: 100-continue" header that boto3/botocore normally sends on
    PutObject — it closes the connection mid-response instead of
    acknowledging it, which surfaces as a ConnectionClosedError on every
    upload regardless of network, auth, region, or signing config (all
    independently verified correct during debugging). Stripping the
    header before signing avoids the handshake entirely. This is a
    permanent fix, not a debug workaround — do not revert to the plain
    S3Storage backend, that reintroduces the bug.
    """

    def _save(self, name, content):
        cleaned_name = clean_name(name)
        name = self._normalize_name(cleaned_name)
        content.seek(0)
        data = content.read()

        extra = {}
        content_type, _ = mimetypes.guess_type(name)
        if content_type:
            extra['ContentType'] = content_type

        obj = self.bucket.Object(name)
        client = obj.meta.client

        def _strip_expect_header(request, **kwargs):
            if 'Expect' in request.headers:
                del request.headers['Expect']

        client.meta.events.register('before-sign.s3.PutObject', _strip_expect_header)
        obj.put(Body=data, **extra)
        return cleaned_name
