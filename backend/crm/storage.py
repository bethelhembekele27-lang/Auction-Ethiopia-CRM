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
        cleaned_name = clean_name(name)
        name = self._normalize_name(cleaned_name)
        content.seek(0)
        data = content.read()

        extra = {}
        content_type, _ = mimetypes.guess_type(name)
        if content_type:
            extra['ContentType'] = content_type

        self.bucket.Object(name).put(Body=data, **extra)
        return cleaned_name
