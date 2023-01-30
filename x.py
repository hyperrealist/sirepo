import numpy
import time
import re
import os
import epics
from sirepo.template import template_common
from pykern import pksubprocess


def run_epics_command(server_address, cmd):
    return template_common.subprocess_output(cmd, epics_env(server_address))


def read_epics_values(server_address, fields):
    assert server_address, "missing remote server address"
    output = run_epics_command(server_address, ["caget"] + fields)
    if not output:
        return None
    res = numpy.array(re.split(r"\s+", str(output))[1::2]).astype("float").tolist()
    return res


def write_epics_values(server_address, fields, values):
    for idx in range(len(fields)):
        if (
            run_epics_command(
                server_address,
                ["caput", fields[idx], str(values[idx])],
            )
            is None
        ):
            return False
    return True


def epics_env(server_address):
    env = os.environ.copy()
    env["EPICS_CA_AUTO_ADDR_LIST"] = "NO"
    env["EPICS_CA_ADDR_LIST"] = server_address
    env["EPICS_CA_SERVER_PORT"] = server_address.split(":")[1]
    return env


def run_sim(fields, address):
    # v = [x + 1 for x in read_epics_values(address, fields)]
    # write_epics_values(address, fields, v)
    # print("sim result=", read_epics_values(address, fields))
    epics.caput_many(f, [x + 1 for x in epics.caget_many(fields)])
    time.sleep(0.5)
    print("sim result=", epics.caget_many(fields))


f = ['sr_epics:corrector1:HCurrent', 'sr_epics:corrector1:VCurrent', 'sr_epics:corrector2:HCurrent', 'sr_epics:corrector2:VCurrent', 'sr_epics:corrector3:HCurrent', 'sr_epics:corrector3:VCurrent', 'sr_epics:corrector4:HCurrent', 'sr_epics:corrector4:VCurrent']
a = "0.0.0.0:5064"
while True:
    run_sim(f, a)
