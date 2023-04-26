# -*- coding: utf-8 -*-
"""test file_lock

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
import pytest


def test_happy():
    import asyncio
    from pykern import pkunit

    pkunit.empty_work_dir()
    asyncio.run(_io("", "x"))


def test_two():
    import asyncio
    from pykern import pkunit

    pkunit.empty_work_dir()

    async def _start():
        await asyncio.gather(
            _io("", "a"),
            _io("a", "b", after=0.1),
            # More than the _LOOP_SLEEP
            _io("abd", "c", before=0.2),
            _io("ab", "d", before=0.01),
        )

    asyncio.run(_start())
    pkunit.pkeq("abdc", _path().read())


async def _io(expect, append, before=0, after=0):
    import asyncio
    from pykern import pkunit
    from sirepo import file_lock
    from pykern.pkdebug import pkdp

    p = _path()
    if before:
        await asyncio.sleep(before)
    async with file_lock.FileLock(p):
        v = p.read() if p.exists() else ""
        pkunit.pkeq(expect, v)
        p.write(v + append)
        if after:
            await asyncio.sleep(after)


def _path():
    from pykern import pkunit

    return pkunit.work_dir().join("foo")
