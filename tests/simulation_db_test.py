# -*- coding: utf-8 -*-
"""test simulation_db operations

:copyright: Copyright (c) 2020 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
import pytest


def test_last_modified(fc):
    from pykern import pkunit, pkio
    from pykern.pkdebug import pkdp
    import os
    from sirepo import simulation_db, srtime

    def _time(data, data_path, trigger, time):
        data.version = simulation_db._OLDEST_VERSION
        data.models.simulation.pkdel("lastModified")
        simulation_db.write_json(data_path, data)
        trigger.setmtime(time)
        data = fc.sr_sim_data()
        pkunit.pkeq(time * 1000, data.models.simulation.lastModified)
        return data

    d = fc.sr_sim_data()
    w = pkunit.work_dir()
    f = pkio.sorted_glob(w.join("db/user/*/myapp/*/sirepo-data.json"))[0]
    t = srtime.utc_now_as_int() - 123487
    _time(d, f, f, t)
    fc.sr_run_sim(d, "heightWeightReport")
    _time(
        d,
        f,
        pkio.sorted_glob(f.dirpath().join("*/in.json"))[0],
        t - 10000,
    )


def test_uid():
    from pykern.pkunit import pkeq, pkexcept, pkre
    from pykern.pkdebug import pkdp
    from sirepo import simulation_db

    qcall = None

    def _do(path, uid, expect=True):
        if expect:
            with pkexcept(AssertionError):
                simulation_db.sim_db_file_uri_to_path(path, expect_uid=uid)
        else:
            p = simulation_db.sim_db_file_uri_to_path(path, expect_uid=uid)
            pkre(path + "$", str(p))

    _do(
        "xxx/elegant/RrCoL7rQ/flash_exe-SwBZWpYFR-PqFi81T6rQ8g",
        "yyy",
    )
    _do(
        "xxx/elegant/RrCoL7rQ/../../../foo",
        "xxx",
    )
    _do(
        "yyy/invalid/R/flash_exe-SwBZWpYFR-PqFi81T6rQ8g",
        "yyy",
    )
    _do(
        "yyy/invalid/RrCoL7rQ/flash_exe-SwBZWpYFR-PqFi81T6rQ8g",
        "yyy",
    )
    _do(
        "HsCFbRrQ/elegant/RrCoL7rQ/{}".format("x" * 129),
        "HsCFbRrQ",
    )
    _do(
        "HsCFbRrQ/elegant/RrCoL7rQ/flash_exe-SwBZWpYFR-PqFi81T6rQ8g",
        "HsCFbRrQ",
        expect=False,
    )
