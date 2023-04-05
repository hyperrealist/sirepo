import os
import re
from pykern import pkunit
from pykern import pksetup
from pykern import pkio
from pykern.pkdebug import pkdp

_EXCLUDE_FILES = re.compile(
    r".*(_console\.py)|^tests/|^venv/" + r"|^run/" + r"|__pycache__/"
)

def rename_paths(old_app_name, new_app_name):
    # rename base and dirnames
    def _iterate(rename_function):
        for f in pkio.walk_tree("./"):
            if re.search(_EXCLUDE_FILES, pkio.py_path().bestrelpath(f)):
                continue
            rename_function(f, old_app_name, new_app_name)

    _iterate(_rename_file)
    _iterate(_rename_dir)

def _rename_file(file_path, old_app_name, new_app_name):
    if old_app_name in file_path.basename:
        os.rename(str(file_path), str(file_path.dirname) + "/" + str(file_path.basename).replace(old_app_name, new_app_name))
        print(f"FILE renamed {str(file_path)} \nto {str(file_path).replace(old_app_name, new_app_name)}")
    return

def _rename_dir(file_path, old_app_name, new_app_name):
    if old_app_name in file_path.dirname:
        d = str(file_path.dirname)
        if os.path.exists(d):
            os.rename(d, d.replace(old_app_name, new_app_name))
            print(f"DIR renamed {d} \nto {d.replace(old_app_name, new_app_name)}")
        else:
            print(d, "does not exist (anymore)")
    return


def rename_references(app_name):
    # replace all instances of app_name in
    # source code. Needs to include different cases
    # ie myapp, my_app, MyApp or whatever
    pass

def iterate_files(app_name):
    for f in pkio.walk_tree("./"):
        if app_name in f.basename:
            print("base hit", f.basename, f.dirname)
    print("\n\n\n\n")
    for f in pkio.walk_tree("./"):
        if app_name in f.dirname:
            print("dir hit", f)

print("iteration with exclusion:")
rename_paths("myapp", "mybetterapp")
