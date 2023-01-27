# -*- coding: utf-8 -*-
"""Test simulationSerial

:copyright: Copyright (c) 2016 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
import pytest


#: Used for a sanity check on serial numbers
_MIN_SERIAL = 10000000


def test_bad_request(fc):
    from pykern import pkunit
    from pykern.pkcollections import PKDict
    from pykern.pkdebug import pkdp, pkdpretty

    fc.sr_login_as_guest()
    r = fc.sr_post_form("listSimulations", PKDict(), raw_response=True)
    pkunit.pkeq(400, r.status_code)


def test_elegant_server_upgraded(fc):
    from pykern.pkdebug import pkdp, pkdpretty
    from pykern.pkunit import pkexcept
    from pykern.pkcollections import PKDict

    d = fc.sr_sim_data("Backtracking")
    d.version = d.version[:-1] + str(int(d.version[-1]) - 1)
    with pkexcept("serverupgraded"):
        fc.sr_post("saveSimulationData", d)


def test_srw_serial_stomp(fc):
    from pykern.pkdebug import pkdp, pkdpretty
    from pykern.pkunit import pkfail, pkok
    from pykern.pkcollections import PKDict
    import copy

    data = fc.sr_sim_data("Young's Double Slit Experiment")
    prev_serial = data.models.simulation.simulationSerial
    prev_data = copy.deepcopy(data)
    pkok(
        prev_serial > _MIN_SERIAL,
        "{}: serial must be greater than {}",
        prev_serial,
        _MIN_SERIAL,
    )
    data["models"]["beamline"][4]["position"] = "61"
    curr_data = fc.sr_post("saveSimulationData", data)
    curr_serial = curr_data["models"]["simulation"]["simulationSerial"]
    pkok(
        prev_serial < curr_serial,
        "{}: serial not incremented, still < {}",
        prev_serial,
        curr_serial,
    )
    prev_data["models"]["beamline"][4]["position"] = "60.5"
    failure = fc.sr_post("saveSimulationData", prev_data)
    pkok(
        failure["error"] == "invalidSerial",
        "{}: unexpected status, expected serial failure",
        failure,
    )
    curr_data["models"]["beamline"][4]["position"] = "60.5"
    curr_serial = curr_data["models"]["simulation"]["simulationSerial"]
    new_data = fc.sr_post("saveSimulationData", curr_data)
    new_serial = new_data["models"]["simulation"]["simulationSerial"]
    pkok(
        curr_serial < new_serial,
        "{}: serial not incremented, still < {}",
        new_serial,
        curr_serial,
    )
