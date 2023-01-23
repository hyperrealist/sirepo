import os
from sirepo.template import template_common
from pykern import pksubprocess

def epics_env(server_address):
    env = os.environ.copy()
    env["EPICS_CA_AUTO_ADDR_LIST"] = "NO"
    env["EPICS_CA_ADDR_LIST"] = server_address
    env["EPICS_CA_SERVER_PORT"] = server_address.split(":")[1]
    return env

def run_epics_command(server_address, cmd):
    return template_common.subprocess_output(cmd, epics_env(server_address))

def monitor_epics_values(fields):
    # assert server_address, "missing remote server address"
    pksubprocess.check_call_with_signals(
        ["camonitor"] + fields
    )

a = "0.0.0.0:5064"
f = ['sr_epics:corrector1:HCurrent', 'sr_epics:corrector1:VCurrent', 'sr_epics:corrector2:HCurrent', 'sr_epics:corrector2:VCurrent', 'sr_epics:corrector3:HCurrent', 'sr_epics:corrector3:VCurrent', 'sr_epics:corrector4:HCurrent', 'sr_epics:corrector4:VCurrent']

monitor_epics_values(f)
