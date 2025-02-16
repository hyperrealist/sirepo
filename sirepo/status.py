# -*- coding: utf-8 -*-
"""Sirepo web server status for remote monitoring

:copyright: Copyright (c) 2018 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkcompat
from pykern import pkconfig
from pykern import pkjson
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp, pkdformat
from sirepo import simulation_db
import asyncio
import datetime
import random
import re
import sirepo.quest
import time


_SLEEP = 1


class API(sirepo.quest.API):
    @sirepo.quest.Spec("require_auth_basic")
    async def api_serverStatus(self):
        """Allow for remote monitoring of the web server status.

        The user must be an existing sirepo uid.  The status checks
        that a simple simulation can complete successfully within a
        short period of time.
        """
        await self._run_tests()
        return self.reply_ok(
            {
                "datetime": datetime.datetime.utcnow().isoformat(),
            }
        )

    async def _run_tests(self):
        """Runs the SRW "Undulator Radiation" simulation's initialIntensityReport"""
        await self._validate_auth_state()
        simulation_type = _cfg.sim_type
        res = await self.call_api(
            "findByNameWithAuth",
            dict(
                simulation_type=simulation_type,
                application_mode="default",
                simulation_name=_cfg.sim_name,
            ),
        )
        try:
            c = res.content_as_redirect()
        finally:
            res.destroy()
        m = re.search(r"/source/(\w+)$", c.uri)
        if not m:
            raise RuntimeError("failed to find sid in resp={}".format(c))
        i = m.group(1)
        d = simulation_db.read_simulation_json(simulation_type, sid=i, qcall=self)
        try:
            d.models.electronBeam.current = d.models.electronBeam.current + (
                random.random() / 10
            )
        except AttributeError:
            assert (
                _cfg.sim_type == "myapp"
            ), f"{_cfg.sim_type} should be myapp or have models.electronBeam.current"
            pass
        d.simulationId = i
        d.report = _cfg.sim_report
        r = None
        resp = None
        try:
            resp = await self.call_api("runSimulation", data=d)
            for _ in range(_cfg.max_calls):
                r = resp.content_as_object()
                resp.destroy()
                resp = None
                pkdlog("resp={}", r)
                if r.state == "error":
                    raise RuntimeError("simulation error: resp={}".format(r))
                if r.state == "completed":
                    if "initialIntensityReport" == d.report:
                        min_size = 50
                        if len(r.z_matrix) < min_size or len(r.z_matrix[0]) < min_size:
                            raise RuntimeError("received bad report output: resp={}", r)
                    return
                d = r.nextRequest
                resp = await self.call_api("runStatus", data=d)
                await asyncio.sleep(_SLEEP)
            raise RuntimeError(
                "simulation timed out: seconds={} resp=".format(
                    _cfg.max_calls * _SLEEP, r
                ),
            )
        finally:
            if resp:
                resp.destroy()
            try:
                await self.call_api("runCancel", data=d)
            except Exception:
                pass

    async def _validate_auth_state(self):
        r = (await self.call_api("authState")).content_as_str()
        m = re.search(r"SIREPO.authState\s*=\s*(.*?);", r)
        assert m, pkdformat("no authState in response={}", r)
        assert pkjson.load_any(m.group(1)).isLoggedIn, pkdformat(
            "expecting isLoggedIn={}", m.group(1)
        )


def init_apis(*args, **kwargs):
    pass


_cfg = pkconfig.init(
    max_calls=(30, int, "1 second calls"),
    # only used for srunit
    sim_name=("Undulator Radiation", str, "which sim"),
    sim_report=("initialIntensityReport", str, "which report"),
    sim_type=("srw", str, "which app to test"),
)
