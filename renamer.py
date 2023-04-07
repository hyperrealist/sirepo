import os
import sys
import re
import subprocess
from pykern import pkunit
from pykern import pksetup
from pykern import pkio
from pykern.pkdebug import pkdp

_EXCLUDE_FILES = re.compile(
    # TODO (gurhar1133): different exclude for replacement?
    # TODO (gurhar1133): better way of doing this?
    f".*{pkunit.WORK_DIR_SUFFIX}/"
    + r".*(_console\.py)|^venv/"
    + r"|^run/"
    + r"|__pycache__/ "
    # TODO (gurhar1133): ignore js/ext
    +r"|\/js\/ext"
    + r"|^.*\.(git|cache)|node_modules|react/public"
    + r"|^.*\.(sdds|bun|png|jpg|woff|eot|ttf|tif|gif|ico|h5m|zip|log|db|csv|h5|stl|dat|log|npy|pyc|paramOpt|gz|woff2)$"
)

class Renamer:
    def __init__(self, old_app_name, new_app_name):
        self.old_app_name = old_app_name
        self.new_app_name = new_app_name
        self.exclude_files = _EXCLUDE_FILES

    def _iterate(self, rename_function, dirs=False):
        for f in pkio.walk_tree("./"):
            if self._exclude(f, dirs):
                continue
            rename_function(f)

    def _rename_paths(self):
        # rename base and dirnames
        self._iterate(self._rename_file)
        self._iterate(self._rename_dir, dirs=True)

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
            if os.path.exists(d) and self._dir_check(d):
                os.rename(d, d.replace(self.old_app_name, self.new_app_name))

    def _dir_check(self, dir):
        l = dir.split("/")
        return self.old_app_name in l[-1]


    def _rename_references(self):
        self._replace_references()
        self._raise_for_references()

    def _exclude(self, file, dirs):
        return re.search(
            self.exclude_files,
            pkio.py_path().bestrelpath(file)
        )

    def _replace_references(self):
        for f in pkio.walk_tree("./"):
            if self._exclude(f, False):
                continue
            with pkio.open_text(f) as t:
                t = t.read()
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
            if not re.search(self.exclude_files, line.split(":")[0]):
                if "js/ext" in line:
                    print("FOUND JS/EXT after regex check for it")
                r.append(line)
        if len(r) > 0:
            m = "\n".join(r)
            raise AssertionError(f"{m}\n{len(r)} REFERENCES TO {self.old_app_name} FOUND")
        print(f"No references to old_app_name={self.old_app_name} found")

    def rename(self):
        print(f"renaming {self.old_app_name} to {self.new_app_name}")
        self._rename_paths()
        self._rename_references()


def main():
    a = sys.argv
    Renamer(a[1], a[2]).rename()

if __name__ == "__main__":
   main()