# -*- coding: utf-8 -*-
"""?

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkio, pkconfig
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp
from pykern import pkunit
from sirepo import feature_config
from sirepo import sim_data
from sirepo import simulation_db
from sirepo import srdb
from sirepo import srtime
from sirepo import util
from sirepo.template import template_common
import datetime
import glob
import subprocess
import json
import os
import os.path
import re
import shutil
import sirepo.quest


_MILLISECONDS_PER_MONTH = 30 * 24 * 60 * 60 * 1000
_MAXIMUM_SIM_AGE_IN_MONTHS = 6
_RENAMER_EXCLUDE_FILES = re.compile(
    # TODO (gurhar1133): different exclude for replacement?
    # TODO (gurhar1133): better way of doing this?
    f".*{pkunit.WORK_DIR_SUFFIX}/"
    + r".*(_console\.py)|^venv/"
    # + r"|^run/"
    + r"|__pycache__/ "
    + r"|.git|.cache|node_modules|react/public|.png|.jpg|.woff|.eot|.ttf|.tif|.gif|.ico|.h5m|.sdds|.zip|.db|.csv|.h5|.bun|.stl|.log|.paramOpt"
)

def audit_proprietary_lib_files(*uid):
    """Add/removes proprietary files based on a user's roles

    For example, add the FLASH proprietary files if user has the sim_type_flash role.

    Args:
        *uid: UID(s) of the user(s) to audit. If None, all users will be audited.
    """
    with sirepo.quest.start() as qcall:
        for u in uid or qcall.auth_db.all_uids():
            with qcall.auth.logged_in_user_set(u):
                sim_data.audit_proprietary_lib_files(qcall=qcall)


def db_upgrade():
    with sirepo.quest.start() as qcall:
        qcall.auth_db.create_or_upgrade()


def create_examples():
    """Adds missing app examples to all users"""
    with sirepo.quest.start() as qcall:
        examples = _get_examples_by_type(qcall)
        for t, s in _iterate_sims_by_users(qcall, examples.keys()):
            for e in examples[t]:
                if e.models.simulation.name not in s[t].keys():
                    _create_example(qcall, e)


def rename_app(old_app_name, new_app_name):
    _Renamer(old_app_name, new_app_name).rename()


def reset_examples():
    with sirepo.quest.start() as qcall:
        e = _get_examples_by_type(qcall)
        for t, s in _iterate_sims_by_users(qcall, e.keys()):
            o = _build_ops(list(s[t].values()), t, e)
            _revert(qcall, o, e)
            _delete(qcall, o)


# TODO(e-carlin): more than uid (ex email)
def delete_user(uid):
    """Delete a user and all of their data across Sirepo and Jupyter

    This will delete information based on what is configured. So configure
    all service (jupyterhublogin, email, etc.) that may be relevant. Once
    this script runs all records are blown away from the db's so if you
    forget to configure something you will have to delete manually.

    Does nothing if `uid` does not exist.

    Args:
        uid (str): user to delete
    """
    import sirepo.template

    with sirepo.quest.start() as qcall:
        if qcall.auth.unchecked_get_user(uid) is None:
            return
        with qcall.auth.logged_in_user_set(uid):
            if sirepo.template.is_sim_type("jupyterhublogin"):
                from sirepo.sim_api import jupyterhublogin

                jupyterhublogin.delete_user_dir(qcall=qcall)
            simulation_db.delete_user(qcall=qcall)
        # This needs to be done last so we have access to the records in
        # previous steps.
        qcall.auth_db.delete_user(uid=uid)


def move_user_sims(uid):
    """Moves non-example sims and lib files into the target user's directory.
    Must be run in the source uid directory."""
    if not os.path.exists("srw/lib"):
        pkcli.command_error("srw/lib does not exist; must run in user dir")
    if not os.path.exists("../{}".format(uid)):
        pkcli.command_error(f"missing user_dir=../{uid}")
    sim_dirs = []
    lib_files = []
    for path in glob.glob("*/*/sirepo-data.json"):
        with open(path) as f:
            data = json.loads(f.read())
        sim = data["models"]["simulation"]
        if "isExample" in sim and sim["isExample"]:
            continue
        sim_dirs.append(os.path.dirname(path))

    for path in glob.glob("*/lib/*"):
        lib_files.append(path)
    for sim_dir in sim_dirs:
        target = "../{}/{}".format(uid, sim_dir)
        assert not os.path.exists(target), "target sim already exists: {}".format(
            target
        )
        pkdlog(sim_dir)
        shutil.move(sim_dir, target)
    for lib_file in lib_files:
        target = "../{}/{}".format(uid, lib_file)
        if os.path.exists(target):
            continue
        pkdlog(lib_file)
        shutil.move(lib_file, target)


def _build_ops(simulations, sim_type, examples):
    ops = PKDict(delete=[], revert=[])
    n = set([x.models.simulation.name for x in examples[sim_type]])
    for sim in simulations:
        if sim.name not in n:
            ops.delete.append((sim, sim_type))
        elif _example_is_too_old(sim.simulation.lastModified):
            ops.revert.append((sim.name, sim_type))
            ops.delete.append((sim, sim_type))
    return ops


def _create_example(qcall, example):
    simulation_db.save_new_example(example, qcall=qcall)


def _delete(qcall, ops):
    for s, t in ops.delete:
        simulation_db.delete_simulation(t, s.simulationId, qcall=qcall)


def _example_is_too_old(last_modified):
    return (
        (srtime.utc_now_as_milliseconds() - last_modified) / _MILLISECONDS_PER_MONTH
    ) > _MAXIMUM_SIM_AGE_IN_MONTHS


def _get_example_by_name(name, sim_type, examples):
    for e in examples[sim_type]:
        if e.models.simulation.name == name:
            return e
    raise AssertionError(f"Failed to find example simulation with name={name}")


def _get_examples_by_type(qcall):
    return PKDict(
        {t: simulation_db.examples(t) for t in feature_config.cfg().sim_types}
    )


def _get_named_example_sims(qcall, all_sim_types):
    return PKDict(
        {
            t: PKDict(
                {
                    x.name: x
                    for x in simulation_db.iterate_simulation_datafiles(
                        t,
                        simulation_db.process_simulation_list,
                        {"simulation.isExample": True},
                        qcall=qcall,
                    )
                }
            )
            for t in all_sim_types
        }
    )


def _is_src_dir(d):
    return re.search(r"/src$", str(d))


def _iterate_sims_by_users(qcall, all_sim_types):
    for d in pkio.sorted_glob(simulation_db.user_path_root().join("*")):
        if _is_src_dir(d):
            continue
        with qcall.auth.logged_in_user_set(simulation_db.uid_from_dir_name(d)):
            s = _get_named_example_sims(qcall, all_sim_types)
            for t in s.keys():
                yield (t, s)


def _revert(qcall, ops, examples):
    for n, t in ops.revert:
        _create_example(qcall, _get_example_by_name(n, t, examples))


class _Renamer:
    def __init__(self, old_app_name, new_app_name):
        self.old_app_name = old_app_name
        self.new_app_name = new_app_name
        self.exclude_files = _RENAMER_EXCLUDE_FILES

    def _iterate(self, rename_function):
        for f in pkio.walk_tree("./"):
            if self._exlude(f):
                continue
            rename_function(f)

    def _rename_paths(self):
        # rename base and dirnames
        self._iterate(self._rename_file)
        self._iterate(self._rename_dir)

    def _rename_file(self, file_path):
        if self.old_app_name in file_path.basename:
            d = str(file_path.dirname)
            b = str(file_path.basename)
            os.rename(
                str(file_path),
                d + "/" + b.replace(self.old_app_name, self.new_app_name)
            )

    def _rename_dir(self, file_path):

        if self.old_app_name in file_path.dirname:
            d = str(file_path.dirname)
            if os.path.exists(d):
                os.rename(d, d.replace(self.old_app_name, self.new_app_name))

    def _rename_references(self):
        self._replace_references()
        self._raise_for_references()

    def _exlude(self, file):
        return re.search(self.exclude_files, pkio.py_path().bestrelpath(file))

    def _replace_references(self):
        for f in pkio.walk_tree("./"):
            if self._exlude(f):
                continue
            with pkio.open_text(f) as t:
                t = t.read()
                # TODO (gurhar1133): camelCase examples?
                self._replace(f, t)

    def _replace(self, file, text):
        if re.search(re.compile(self.old_app_name), text):
            # TODO (gurhar1133): re.sub instead?
            pkio.write_text(
                file,
                text.replace(
                    self.old_app_name,
                    self.new_app_name,
                ).replace(
                    self.old_app_name.title(),
                    self.new_app_name.title(),
                ).replace(
                    self.old_app_name.upper(),
                    self.new_app_name.upper(),
                )
            )

    def _raise_for_references(self):
        output = subprocess.check_output(
            [
                "grep",
                "-r",
                "-i",
                "-I",
                "--exclude-dir='.pytest_cache'",
                # "--exclude-dir='run'",
                "--exclude='./x.py'",
                "--exclude-dir='sirepo.egg-info'",
                f"{self.old_app_name}",
            ]
        ).decode('utf-8').split('\n')[:-1]
        r = []
        # TODO (gurhar1133): way to avoid this step?
        for line in output:
            # TODO (gurhar1133): maybe exlude all but run dir here?
            if not re.search(self.exclude_files, line):
                r.append(line)
        if len(r) > 0:
            m = "\n".join(r)
            raise AssertionError(f"{m}\n{len(r)} REFERENCES TO {self.old_app_name} FOUND")
        print(f"No references to old_app_name={self.old_app_name} found")

    def rename(self):
        print(f"renaming {self.old_app_name} to {self.new_app_name}")
        self._rename_paths()
        self._rename_references()
