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
    r".*(_console\.py)|^venv/" + r"|^run/" + r"|__pycache__/|.git|.cache|node_modules|react/public|.png|.jpg|.woff|.eot|.ttf|.tif|.gif|.ico|.h5m|.sdds|.zip|.db|.csv|.h5|.bun|.stl|.log|_work$"
)


_INCLUDE_FILES = "?"

class _Renamer:
    def __init__(self, old_app_name, new_app_name):
        self.old_app_name = old_app_name
        self.new_app_name = new_app_name
        self.exclude_files = _EXCLUDE_FILES
        self.include_files = _INCLUDE_FILES

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
        self._replace_references()
        self._raise_for_references()


    def _exlude(self, file):
        return re.search(self.exclude_files, pkio.py_path().bestrelpath(file))


    def _replace_references(self):
        for f in pkio.walk_tree("./"):
            if self._exlude(f):
                continue
            print("attempting replacement on", f.dirname + "/" + f.basename)
            with pkio.open_text(f) as t:
                # TODO (gurhar1133): need to handle camel case etc
                t = t.read()
                self._replace(f, t, self.old_app_name, self.new_app_name)
                self._replace(f, t, self.old_app_name.title(), self.new_app_name.title())


    def _replace(self, file, text, reference, replacement):
        if re.search(re.compile(reference), text):
            # TODO (gurhar1133): new_app_name needs to match the case of
            # old_app_name
            pkio.write_text(
                file,
                text.replace(reference, replacement)
            )


    def _raise_for_references(self):

        output = subprocess.check_output(
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
            ]
        ).decode('utf-8').split('\n')[:-1]
        # p = subprocess.run(
        #     [
        #         "grep",
        #         "-r",
        #         "-i",
        #         "-I",
        #         "--exclude-dir='.pytest_cache'",
        #         "--exclude-dir='run'",
        #         "--exclude='./x.py'",
        #         "--exclude-dir='sirepo.egg-info'",
        #         f"{self.old_app_name}",
        #     ],
        #     stdout=subprocess.PIPE,
        #     stderr=subprocess.PIPE,
        # )
        # print("len", len(p.stdout))
        if len(output) > 0:
            for line in output:
                print(line.split(":")[0])
            raise AssertionError(f"{len(output)} REFERENCES TO {self.old_app_name} FOUND")
        print(f"No references to old_app_name={self.old_app_name} found")

    def rename(self):
        print(f"renaming {self.old_app_name} to {self.new_app_name}")
        self._rename_paths()
        self._rename_references()

# _Renamer("mybetterappname", "mybetterapp").rename()
a = sys.argv
_Renamer(a[1], a[2]).rename()