# -*- coding: utf-8 -*-
"""rsopt interface.

:copyright: Copyright (c) 2023 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from pykern import pkio
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdc, pkdp
from sirepo.template import template_common
import re
import sirepo.sim_data
import sirepo.util

class RSOptBase():

    EXPORT_RSOPT = "exportRsOpt"
    ML_REPORT = "machineLearningAnimation"
    ML_OUTPUT = "results.h5"

    def __init__(self, elements):
        self.elements = elements
        pass


    def rsopt_jinja_context(self, model, lib_files=(), run_in_sirepo=True):
        import multiprocessing

        res = PKDict(
            fileBase=RSOptBase.EXPORT_RSOPT,
            forRSOpt=True,
            libFiles=lib_files,
            numCores=int(model.numCores),
            numWorkers=max(1, multiprocessing.cpu_count() - 1),
            numSamples=int(model.numSamples),
            outFileName=f"{RSOptBase.EXPORT_RSOPT}.out",
            randomSeed=model.randomSeed if model.randomSeed is not None else "",
            resultsFileName=RSOptBase.ML_OUTPUT,
            rsOptCharacteristic=model.characteristic,
            rsOptElements=self._process_rsopt_elements(model.elements),
            rsOptParams=self.rsopt_params(),
            rsOptParamsNoRotation=self.rsopt_params(rotations=False),
            rsOptOutFileName="scan_results",
            runInSirepo=run_in_sirepo,
            scanType=model.scanType,
            totalSamples=model.totalSamples,
            zipFileName=f"{RSOptBase.EXPORT_RSOPT}.zip",
        )
        res.update(_export_rsopt_files())
        return res


    def safe_item_name(self, name, name_list):
        return name


    def _process_rsopt_elements(self, elements):
        x = [e for e in elements if e.enabled and e.enabled != "0"]
        names = []
        for e in x:
            e.title = self.safe_item_name(e.title, names)
            names.append(e.title)
            for p in self.rsopt_params():
                if p in e:
                    e[p].offsets = sirepo.util.split_comma_delimited_string(
                        e[f"{p}Offsets"], float
                    )

        return x


    def rsopt_params(self, rotations=True):
        return {
            i
            for sublist in [
                v
                for v in [
                    list(self.elements[k].keys())
                    for k in self.elements
                ]
            ]
            for i in sublist
            if rotations or (not rotations and i != "rotation")
        }


    def _write_rsopt_files(data, path, ctx):
        for f in _export_rsopt_files().values():
            pkio.write_text(
                run_dir.join(f),
                python_source_for_model(data, data.report, None, plot_reports=False)
                if f == f"{_SIM_DATA.EXPORT_RSOPT}.py"
                else template_common.render_jinja(SIM_TYPE, ctx, f),
            )


    def _write_zip(self, data, ctx):
        import zipfile
        def _write(zip_file, path):
            zip_file.writestr(
                path,
                python_source_for_model(data, data.report, None, plot_reports=False)
                if path == f"{RSOptBase.EXPORT_RSOPT}.py"
                else template_common.render_jinja(SIM_TYPE, ctx, path),
            )

        filename = f"{RSOptBase.EXPORT_RSOPT}.zip"
        with zipfile.ZipFile(
            f"{RSOptBase.EXPORT_RSOPT}.zip",
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            allowZip64=True,
        ) as z:
            for f in _export_rsopt_files().values():
                _write(z, f)
            for f in ctx.libFiles:
                z.write(f, f)
        return PKDict(
            content_type="application/zip",
            filename=filename,
        )

def _export_rsopt_config(data, run_dir):
    ctx = _rsopt_jinja_context(data)
    if _SIM_DATA.is_for_ml(data.report):
        _write_rsopt_files(data, run_dir, ctx)
    else:
        _write_rsopt_zip(data, ctx)


def _export_rsopt_files():
    files = PKDict()
    for t in (
        "py",
        "sh",
        "yml",
    ):
        files[f"{t}FileName"] = f"{_SIM_DATA.EXPORT_RSOPT}.{t}"
    files.postProcFileName = f"{_SIM_DATA.EXPORT_RSOPT}_post.py"
    files.readmeFileName = "README.txt"
    return files


def _is_for_rsopt(report):
    return report == _SIM_DATA.EXPORT_RSOPT


