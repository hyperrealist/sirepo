# -*- coding: utf-8 -*-
"""Operations run inside the report directory to extract data.

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkcompat
from pykern import pkconfig
from pykern import pkconst
from pykern import pkio
from pykern import pkjson
from pykern import pkunit
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp, pkdexc, pkdc, pkdlog
from sirepo import job
from sirepo import simulation_db
from sirepo.template import template_common
import contextlib
import os
import re
import requests
import signal
import sirepo.sim_data
import sirepo.sim_run
import sirepo.template
import sirepo.util
import subprocess
import sys
import time

_MAX_FASTCGI_EXCEPTIONS = 3

_MAX_FASTCGI_MSG = int(1e8)


def default_command(in_file):
    """Reads `in_file` passes to `msg.jobCmd`

    Must be called in run_dir

    Writes its output on stdout.

    Args:
        in_file (str): json parsed to msg
    Returns:
        str: json output of command, e.g. status msg
    """
    try:
        f = pkio.py_path(in_file)
        msg = pkjson.load_any(f)
        # TODO(e-carlin): find common place to serialize/deserialize paths
        msg.runDir = pkio.py_path(msg.runDir)
        f.remove()
        res = globals()["_do_" + msg.jobCmd](
            msg, sirepo.template.import_module(msg.simulationType)
        )
        if res is None:
            return
        r = PKDict(res).pksetdefault(state=job.COMPLETED)
    except Exception as e:
        r = _maybe_parse_user_alert(e)
    return pkjson.dump_pretty(r, pretty=False)


class _AbruptSocketCloseError(Exception):
    """Fastcgi unix domain socket closed"""

    pass


def _background_percent_complete(msg, template, is_running):
    return template.background_percent_complete(
        sirepo.sim_data.get_class(msg.simulationType).parse_model(msg.data),
        msg.runDir,
        is_running,
    ).pksetdefault(
        # TODO(robnagler) this is incorrect, because we want to see file updates
        #   not just our polling frequency
        lastUpdateTime=lambda: _mtime_or_now(msg.runDir),
        frameCount=0,
        percentComplete=0.0,
    )


def _dispatch_compute(msg, template):
    def _op(expect_file):
        r = getattr(template_common, f"{msg.jobCmd}_dispatch")(
            msg.data, data_file_uri=msg.get("dataFileUri")
        )
        if not isinstance(r, template_common.JobCmdFile):
            # ok to not return JobCmdFile if there was an error
            return r
        if not expect_file:
            return PKDict(
                state=job.ERROR,
                error=f"method={template.SIM_TYPE}.{msg.jobCmd}_{msg.data.method} unexpected return=JobCmdFile uri={r.uri}",
            )
        if e := _error_if_response_too_large(r.content):
            return e
        requests.put(
            msg.dataFileUri + r.uri,
            data=r.content,
            verify=job.cfg().verify_tls,
        ).raise_for_status()
        return job.ok_reply()

    try:
        x = sirepo.sim_data.get_class(
            template.SIM_TYPE,
        ).does_api_reply_with_file(msg.api, msg.data.method)
        if x:
            with sirepo.sim_run.tmp_dir(chdir=True) as d:
                return _op(expect_file=x)
        else:
            return _op(expect_file=x)
    except Exception as e:
        return _maybe_parse_user_alert(e)


def _do_cancel(msg, template):
    if hasattr(template, "remove_last_frame"):
        template.remove_last_frame(msg.runDir)
    return PKDict()


def _do_compute(msg, template):
    msg.runDir = pkio.py_path(msg.runDir)
    with msg.runDir.join(template_common.RUN_LOG).open("w") as run_log:
        p = subprocess.Popen(
            _do_prepare_simulation(msg, template).cmd,
            stdout=run_log,
            stderr=run_log,
        )

    if pkconfig.in_dev_mode() and pkunit.is_test_run():
        sys.stderr.write(pkio.read_text(msg.runDir.join(template_common.RUN_LOG)))
    while True:
        for j in range(20):
            # Not asyncio.sleep: not in coroutine
            time.sleep(0.1)
            r = p.poll()
            i = r is None
            if not i:
                if r == -signal.SIGKILL:
                    return PKDict(
                        state=job.ERROR,
                        error="Terminated Process. Possibly ran out of memory",
                    )
                break
        if msg.isParallel:
            # TODO(e-carlin): This has a potential to fail. We likely
            # don't want the job to fail in this case
            _write_parallel_status(msg, template, i)
        if i:
            continue
        return _on_do_compute_exit(
            r == 0,
            msg.isParallel,
            template,
            msg.runDir,
            msg.computeModel,
            msg.simulationId,
        )


def _do_analysis_job(msg, template):
    return _dispatch_compute(msg, template)


def _do_download_data_file(msg, template):
    try:
        r = template.get_data_file(
            msg.runDir,
            msg.analysisModel,
            msg.frame,
            options=PKDict(suffix=msg.suffix),
        )
        if not isinstance(r, PKDict):
            if isinstance(r, str):
                r = msg.runDir.join(r, abs=1)
            r = PKDict(filename=r)
        u = r.get("uri")
        if u is None:
            u = r.filename.basename
        c = r.get("content")
        if e := _error_if_response_too_large(c if c else r.filename):
            return e
        if c is None:
            c = (
                pkcompat.to_bytes(pkio.read_text(r.filename))
                if u.endswith((".py", ".txt", ".csv"))
                else r.filename.read_binary()
            )
        requests.put(
            msg.dataFileUri + u,
            data=c,
            verify=job.cfg().verify_tls,
        ).raise_for_status()
        return PKDict()
    except Exception as e:
        return PKDict(state=job.ERROR, error=e, stack=pkdexc())


def _do_fastcgi(msg, template):
    import socket

    @contextlib.contextmanager
    def _update_run_dir_and_maybe_chdir(msg):
        msg.runDir = pkio.py_path(msg.runDir) if msg.runDir else None
        with pkio.save_chdir(
            msg.runDir,
        ) if msg.runDir else contextlib.nullcontext():
            yield

    def _recv():
        m = b""
        while True:
            r = s.recv(_MAX_FASTCGI_MSG)
            if not r:
                pkdlog(
                    "job_cmd should be killed before socket is closed msg={}",
                    msg,
                )
                raise _AbruptSocketCloseError()
            if len(m) + len(r) > _MAX_FASTCGI_MSG:
                raise RuntimeError("message larger than {} bytes", _MAX_FASTCGI_MSG)
            m += r
            if m[-1:] == b"\n":
                return pkjson.load_any(m)

    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.connect(msg.fastcgiFile)
    c = 0
    while True:
        try:
            m = _recv()
            if not m:
                return
            with _update_run_dir_and_maybe_chdir(m):
                r = globals()["_do_" + m.jobCmd](
                    m, sirepo.template.import_module(m.simulationType)
                )
            r = PKDict(r).pksetdefault(state=job.COMPLETED)
            c = 0
        except _AbruptSocketCloseError:
            return
        except Exception as e:
            assert (
                c < _MAX_FASTCGI_EXCEPTIONS
            ), "too many fastgci exceptions {}. Most recent error={}".format(c, e)
            c += 1
            r = _maybe_parse_user_alert(e)
        s.sendall(_validate_msg_and_jsonl(r))


def _do_get_simulation_frame(msg, template):
    try:
        return template_common.sim_frame_dispatch(
            msg.data.copy().pkupdate(run_dir=msg.runDir),
        )
    except Exception as e:
        return _maybe_parse_user_alert(e, error="report not generated")


def _do_prepare_simulation(msg, template):
    if "libFileList" in msg:
        msg.data.libFileList = msg.libFileList
    return PKDict(
        cmd=simulation_db.prepare_simulation(
            msg.data,
            msg.runDir,
        )[0],
    )


def _do_sbatch_status(msg, template):
    s = pkio.py_path(msg.stopSentinel)
    while True:
        if s.exists():
            if job.COMPLETED not in s.read():
                # told to stop for an error or otherwise
                return None
            _write_parallel_status(msg, template, False)
            pkio.unchecked_remove(s)
            return PKDict(state=job.COMPLETED)
        _write_parallel_status(msg, template, True)
        # Not asyncio.sleep: not in coroutine
        time.sleep(msg.nextRequestSeconds)
    # DOES NOT RETURN


def _do_sequential_result(msg, template):
    r = template_common.read_sequential_result(msg.runDir)
    # Read this first: https://github.com/radiasoft/sirepo/issues/2007
    if hasattr(template, "prepare_sequential_output_file") and "models" in msg.data:
        template.prepare_sequential_output_file(msg.runDir, msg.data)
        r = template_common.read_sequential_result(msg.runDir)
    return r


def _do_stateful_compute(msg, template):
    return _dispatch_compute(msg, template)


def _do_stateless_compute(msg, template):
    return _dispatch_compute(msg, template)


def _error_if_response_too_large(payload):
    def _payload_size(payload):
        return (
            payload.size()
            if isinstance(payload, pkconst.PY_PATH_LOCAL_TYPE)
            else len(payload)
        )

    if _payload_size(payload) >= job.cfg().max_message_bytes:
        return PKDict(
            state=job.COMPLETED,
            error="Response is too large to send",
            errorCode=job.ERROR_CODE_RESPONSE_TOO_LARGE,
        )
    return None


def _maybe_parse_user_alert(exception, error=None):
    e = error or str(exception)
    if isinstance(exception, sirepo.util.UserAlert):
        e = exception.sr_args.error
    return PKDict(state=job.ERROR, error=e, stack=pkdexc())


def _on_do_compute_exit(
    success_exit, is_parallel, template, run_dir, compute_model, sim_id
):
    # locals() must be called before anything else so we only get the function
    # arguments
    kwargs = locals()

    def _failure_exit():
        a = _post_processing()
        if not a:
            f = run_dir.join(template_common.RUN_LOG)
            if f.exists():
                a = _parse_python_errors(pkio.read_text(f))
        if not a:
            a = "non-zero exit code"
        return PKDict(state=job.ERROR, error=a)

    def _post_processing():
        if hasattr(template, "post_execution_processing"):
            return template.post_execution_processing(**kwargs)
        return None

    def _success_exit():
        return PKDict(
            state=job.COMPLETED,
            alert=_post_processing(),
        )

    try:
        return _success_exit() if success_exit else _failure_exit()
    except Exception as e:
        return PKDict(state=job.ERROR, error=e, stack=pkdexc())


def _mtime_or_now(path):
    """mtime for path if exists else time.time()

    Args:
        path (py.path):

    Returns:
        int: modification time
    """
    return int(path.mtime() if path.exists() else time.time())


def _parse_python_errors(text):
    m = re.search(
        r"^Traceback .*?^\w*(?:Error|Exception):\s*(.*)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if m:
        return re.sub(r"\nTraceback.*$", "", m.group(1), flags=re.S).strip()
    return ""


def _validate_msg_and_jsonl(msg):
    m = pkjson.dump_bytes(msg)
    if r := _error_if_response_too_large(m):
        m = pkjson.dump_bytes(r)
    return m + b"\n"


def _write_parallel_status(msg, template, is_running):
    sys.stdout.write(
        pkjson.dump_pretty(
            PKDict(
                state=job.RUNNING,
                parallelStatus=_background_percent_complete(msg, template, is_running),
            ),
            pretty=False,
        )
        + "\n",
    )
