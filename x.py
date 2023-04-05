import os
import re
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
        # replace all instances of app_name in
        # source code. Needs to include different cases
        # ie myapp, my_app, MyApp or whatever
        pass

    def rename(self):
        print(f"renaming {self.old_app_name} to {self.new_app_name}")
        self._rename_paths()
        self._rename_references()

_Renamer("myapp", "mybetterapp").rename()