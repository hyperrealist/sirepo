from pykern import pksubprocess
import epics


def monitor_epics_values(fields):
    pksubprocess.check_call_with_signals(
        ["camonitor"] + fields
    )

    # epics.camonitor_many(f)


# a = "0.0.0.0:5064"
f = ['sr_epics:corrector1:HCurrent', 'sr_epics:corrector1:VCurrent', 'sr_epics:corrector2:HCurrent', 'sr_epics:corrector2:VCurrent', 'sr_epics:corrector3:HCurrent', 'sr_epics:corrector3:VCurrent', 'sr_epics:corrector4:HCurrent', 'sr_epics:corrector4:VCurrent']

monitor_epics_values(f)
