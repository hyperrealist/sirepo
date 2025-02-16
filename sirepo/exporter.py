# -*- coding: utf-8 -*-
"""Export simulations in a single archive

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkcollections
from pykern import pkio
from pykern import pkjson
from pykern.pkdebug import pkdp
from sirepo import sim_data
from sirepo import simulation_db
from sirepo import template
import sirepo.sim_run
import sirepo.util


def create_archive(sim, qcall):
    """Zip up the json file and its dependencies

    Args:
        sim (PKDict): parsed request

    Returns:
        py.path.Local: zip file name
    """
    with sirepo.sim_run.tmp_dir(qcall=qcall) as d:
        return qcall.reply_attachment(
            _create_zip(sim, out_dir=d, qcall=qcall),
            filename=sim.filename,
        )


def _create_zip(sim, out_dir, qcall):
    """Zip up the json file and its dependencies

    Args:
        sim (req): simulation
        out_dir (py.path): where to write to

    Returns:
        py.path.Local: zip file name
    """
    path = out_dir.join(sim.id + ".zip")
    data = simulation_db.open_json_file(sim.type, sid=sim.id, qcall=qcall)
    simulation_db.update_rsmanifest(data)
    data.pkdel("report")
    files = sim_data.get_class(data).lib_files_for_export(data, qcall=qcall)
    for f in _python(data, sim, qcall):
        files.append(f)
    with sirepo.util.write_zip(str(path)) as z:
        for f in files:
            if hasattr(sim.template, "export_filename"):
                n = sim.template.export_filename(
                    sim.filename,
                    f.basename,
                )
            else:
                n = f.basename
            z.write(str(f), n)
        z.writestr(
            simulation_db.SIMULATION_DATA_FILE,
            pkjson.dump_pretty(data, pretty=True),
        )
    return path


def _python(data, sim, qcall):
    """Generate python in current directory

    Args:
        data (dict): simulation

    Returns:
        py.path.Local: file to append
    """
    import sirepo.template
    import copy

    template = sirepo.template.import_module(data)
    res = pkio.py_path("run.py")
    d = copy.deepcopy(data)
    d.file_ext = ".zip"
    t = template.python_source_for_model(d, model=None, qcall=qcall)
    if type(t) == pkcollections.PKDict:
        return _write_multiple_export_files(t)
    res.write(t)
    return [res]


def _write_multiple_export_files(source):
    r = []
    for k in source.keys():
        p = pkio.py_path(k)
        p.write(source[k])
        r.append(p)
    return r
