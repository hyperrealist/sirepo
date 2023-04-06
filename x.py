import re

pattern = re.compile(r"ham|^.*\.(sdds)$")
paths = ["dir/path/file.stuff.sdds", "file.sdds"]
for path in paths:
    print(re.search(pattern, path))

