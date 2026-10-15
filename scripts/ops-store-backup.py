#!/usr/bin/env python3
"""Copy a bounded encrypted capture by file descriptor, never follow a data-volume symlink."""
import json
import os
from pathlib import Path
import stat
import sys
import uuid


def copy_encrypted(capture, destination, expected_uid=1000):
    descriptor = os.open(capture, os.O_RDONLY | os.O_NOFOLLOW)
    temporary = Path(str(destination) + '.' + str(uuid.uuid4()) + '.tmp')
    created = False
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != expected_uid or not 32 <= before.st_size <= 55 * 1024 * 1024:
            raise ValueError('Invalid encrypted capture.')
        prefix = os.read(descriptor, 4096)
        header, separator, _ = prefix.partition(b'\n')
        value = json.loads(header)
        if not separator or value.get('format') != 'settlens-recovery-v1' or len(value.get('keyId', '')) != 64:
            raise ValueError('Invalid encrypted header.')
        output = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created = True
        with os.fdopen(output, 'wb') as target:
            target.write(prefix)
            remaining = before.st_size - len(prefix)
            while remaining:
                chunk = os.read(descriptor, min(65536, remaining))
                if not chunk:
                    raise ValueError('Capture changed.')
                target.write(chunk)
                remaining -= len(chunk)
            after = os.fstat(descriptor)
            if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
                raise ValueError('Capture changed.')
            target.flush()
            os.fsync(target.fileno())
        os.link(temporary, destination)  # Fail if a backup already occupies this name.
        directory = os.open(Path(destination).parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.close(descriptor)
        if created:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError()
        copy_encrypted(sys.argv[1], sys.argv[2])
    except Exception:
        print('Settlens encrypted capture was not accepted; no source data was printed.', file=sys.stderr)
        sys.exit(1)
