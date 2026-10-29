#!/usr/bin/env python3
"""Fail an Android bundle or APK that carries an OkHttp below 4.12.1 or 5.5.1 (EBE-7061).

OkHttp writes its own version into its user agent ("okhttp/4.12.1"), a string constant in the DEX.
This reads every DEX file in an .aab (base/dex/classes*.dex) or .apk (classes*.dex) and prints the
versions it finds. The fix is 4.12.1 in the 4.x line and 5.5.1 in the 5.x line, so a 5.x below 5.5.1,
any other major and any pre-release (okhttp/5.0.0-alpha.14) fail. Exit 0 when every one is at or above
its line's floor, 1 when one is below it or none is
found (OkHttp left the app, or R8 changed the constant: look before trusting the bundle), 2 on bad input.

    python3 tools/check_okhttp.py android/app/build/outputs/apk/release/app-release.apk

plugins/withOkHttpFloor.js sets the floor in the build; this checks what the build produced.
"""
import re
import sys
import zipfile

FLOORS = {4: (4, 12, 1), 5: (5, 5, 1)}
VERSION = re.compile(rb"okhttp/(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.]+)?")


def versions(path):
    found = set()
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if re.fullmatch(r"(base/dex/)?classes\d*\.dex", name):
                for m in VERSION.finditer(z.read(name)):
                    nums = tuple(int(x) for x in m.groups()[:3])
                    found.add((nums, (m.group(4) or b"").decode()))
    return sorted(found)


def low(v):
    nums, pre = v
    floor = FLOORS.get(nums[0])
    return floor is None or nums < floor or bool(pre)


def name(v):
    return ".".join(map(str, v[0])) + v[1]


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[0])
        print("usage: check_okhttp.py <bundle.aab|app.apk>")
        return 2
    try:
        found = versions(argv[1])
    except (OSError, zipfile.BadZipFile) as e:
        print(f"check_okhttp: cannot read {argv[1]}: {e}")
        return 2
    floor = " or ".join(".".join(map(str, f)) for f in FLOORS.values())
    if not found:
        print(f"check_okhttp: no okhttp/<version> string in {argv[1]}")
        return 1
    bad = [v for v in found if low(v)]
    for v in found:
        print(f"okhttp/{name(v)}" + ("  BELOW " + floor if v in bad else ""))
    if bad:
        print(f"check_okhttp: FAIL, OkHttp below {floor} (plugins/withOkHttpFloor.js)")
        return 1
    print(f"check_okhttp: ok, every OkHttp at or above {floor} in its line")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
