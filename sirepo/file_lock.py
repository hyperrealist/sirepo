# -*- coding: utf-8 -*-
"""file locking

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdlog, pkdp
import pykern.pkio
import os
import fcntl
import tornado.gen

_SLEEP_MS = 50


class FileLock:
    def __init__(self, path):
        self._path = str(pykern.pkio.py_path(path)) + ".flock"

    async def __enter__(self):
        for i in _SLEEP_MS * _cfg.timeout:
            try:
                f = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_TRUNC)
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                # Verify open file and path on disk are same file
                # https://stackoverflow.com/a/18745264
                if os.stat(f).st_ino == os.stat(self._path).st_ino:
                    self._lock = f
                    return None
            except (IOError, OSError, FileNotFoundError):
                pass
            if f:
                try:
                    f.close()
                except Exception:
                    pass
            commit here?
            await tornado.gen.sleep(self.cfg.agent_log_read_sleep)

        raise RuntimeError(f"fail to flock path={self._path} timeout={_cfg.timeout}")

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._lock:
            unlink(self.path)
            self._lock.close()
        return False


_cfg = pkconfig.init(timeout=(60, pkconfig.parse_seconds, "how long to wait on flock"))
