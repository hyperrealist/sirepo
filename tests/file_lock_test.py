# -*- coding: utf-8 -*-
"""test file_lock

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
import pytest


def test_happy():
    import asyncio

    async def _simple():
        from pykern import pkunit
        from sirepo import file_lock

        with pkunit.save_chdir_work() as d:
            async with file_lock.FileLock(d.join("foo")):
                pass

    asyncio.run(_simple())
