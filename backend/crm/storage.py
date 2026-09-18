import mimetypes
from storages.backends.s3 import S3Storage
from storages.utils import clean_name


class SimpleS3Storage(S3Storage):
    """
    Overrides S3Storage._save to use a single-shot put_object() call
    instead of upload_fileobj()'s threaded s3transfer TransferManager,
    which reproducibly drops the connection against Backblaze B2 from
    Render — confirmed via a direct network test that a plain PUT with
    a body to the same endpoint completes fine. Only suitable for the
    small attachment files this app handles (not large multi-GB files).
    """
    def _save(self, name, content):
        print(f"SimpleS3Storage._save() called for: {name}")
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
            # HTTPHeaders is a MutableMapping, not a dict — no .pop(). Use
            # 'in' + del instead. Disabling the Expect: 100-continue
            # handshake since Backblaze B2 appears to mishandle it (closes
            # the connection instead of responding), per prior investigation.
            if 'Expect' in request.headers:
                del request.headers['Expect']

        client.meta.events.register('before-sign.s3.PutObject', _strip_expect_header)
        obj.put(Body=data, **extra)
        return cleaned_name
