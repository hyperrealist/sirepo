# -*- coding: utf-8 -*-
"""test file_lock

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
import pytest


def test_four():
    import multiprocessing
    import time
    from pykern import pkunit
    from sirepo import file_lock
    from pykern.pkdebug import pkdp

    def _p(fmt, *args):
        pkdp("{} " + fmt, threading.current_thread().name, *args)
        return args[0]

    def _io(expect, append, before=0, after=0):
        pkdp(threading.current_thread())
        p = _path()
        if before:
            _p("{}", before)
            time.sleep(before)
        with file_lock.FileLock(p):
            v = _p("{}", p.read()) if p.exists() else ""
            pkunit.pkeq(expect, v)
            p.write(v + append)
            if after:
                _p("{}", after)
                time.sleep(after)

    def _path():
        from pykern import pkunit

        return pkunit.work_dir().join("foo")

    pkunit.empty_work_dir()

    def _start(name, *args, **kwargs):
        t = threading.Thread(target=_io, name=name, args=args, kwargs=kwargs)
        t.start()
        return t

    for t in [
        _start("t1", "", "a"),
        _start("t2", "a", "b", after=1),
        # More than the _LOOP_SLEEP
        _start("t3", "abd", "c", before=2),
        _start("t4", "ab", "d", before=0.5),
    ]:
        t.join()
        pkdp(t)
    pkunit.pkeq("abdc", _path().read())


def test_happy():
    from pykern import pkunit
    from sirepo import file_lock

    def _simple(path):
        with file_lock.FileLock(path):
            pass

    _simple(pkunit.empty_work_dir())
