import os
import sys
import re
import subprocess
from pykern import pkunit
from pykern import pksetup
from pykern import pkio
from pykern.pkdebug import pkdp

_EXCLUDE_FILES = re.compile(
    r".*(_console\.py)|^tests/|^venv/" + r"|^run/" + r"|__pycache__/"
)

class _Renamer:
    def __init__(self, old_app_name, new_app_name):
        self.old_app_name = old_app_name
        self.new_app_name = new_app_name
        self.exclude_files = _EXCLUDE_FILES

    def _iterate(self, rename_function):
        for f in pkio.walk_tree("./"):
            if re.search(_EXCLUDE_FILES, pkio.py_path().bestrelpath(f)):
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
            print(
                f"FILE renamed {str(file_path)} \nto {str(file_path).replace(self.old_app_name, self.new_app_name)}"
            )

    def _rename_dir(self, file_path):
        if self.old_app_name in file_path.dirname:
            d = str(file_path.dirname)
            if os.path.exists(d):
                os.rename(d, d.replace(self.old_app_name, self.new_app_name))
                print(f"DIR renamed {d} \nto {d.replace(self.old_app_name, self.new_app_name)}")
            else:
                print(d, "does not exist (anymore)")

    def _rename_references(self):
        # assert 0, f"{self.old_app_name} {self.new_app_name}"
        p = subprocess.run(
            [
                "grep",
                "-r",
                "-i",
                "-I",
                "--exclude-dir='.pytest_cache'",
                "--exclude-dir='run'",
                "--exclude='./x.py'",
                "--exclude-dir='sirepo.egg-info'",
                f"{self.old_app_name}",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        print("len", len(p.stdout))
        if len(p.stdout) > 0:
            raise AssertionError(f"REFERENCES TO {self.old_app_name} FOUND:\n{p.stdout}")
        print(f"No references to old_app_name={self.old_app_name} found")

    def rename(self):
        print(f"renaming {self.old_app_name} to {self.new_app_name}")
        self._rename_paths()
        self._rename_references()

# _Renamer("myapp", "mybetterapp").rename()
a = sys.argv
_Renamer(a[1], a[2])._rename_references()