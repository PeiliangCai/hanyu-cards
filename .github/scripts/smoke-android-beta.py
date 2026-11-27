"""Exercise the signed preview on a clean Android emulator through its accessibility tree."""

import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


PACKAGE = "com.hanyucards.app.preview"
ACTIVITY = f"{PACKAGE}/com.hanyucards.app.MainActivity"
TODAY = r"^Build a little Mandarin\b"
WINDOW = "/sdcard/hanyu-beta-window.xml"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def adb(*args, check=True, timeout=30):
    result = subprocess.run(
        ["adb", *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, timeout=timeout, check=False,
    )
    if check and result.returncode:
        raise RuntimeError(f"adb {' '.join(args)} failed: {result.stdout.strip()}")
    return result.stdout.strip()


def prepare_device(api):
    reported_api = adb("shell", "getprop", "ro.build.version.sdk")
    require(reported_api == api, f"Expected Android API {api}, emulator reports {reported_api}.")
    print(f"Android API {reported_api} on {adb('shell', 'getprop', 'ro.product.model')}")
    print(f"Build fingerprint: {adb('shell', 'getprop', 'ro.build.fingerprint')}")
    webview = adb("shell", "dumpsys", "webviewupdate")
    current_webview = next((line.strip() for line in webview.splitlines() if "Current WebView package" in line), "")
    require(current_webview, "Unable to identify the system WebView.")
    print(current_webview)

    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "wm", "dismiss-keyguard")
    adb("shell", "svc", "power", "stayon", "true")
    for setting in ("window_animation_scale", "transition_animation_scale", "animator_duration_scale"):
        adb("shell", "settings", "put", "global", setting, "0")
    adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
    adb("shell", "svc", "wifi", "disable")
    adb("shell", "svc", "data", "disable")
    require(adb("shell", "settings", "get", "global", "airplane_mode_on") == "1"
            and adb("shell", "settings", "get", "global", "wifi_on") == "0",
            "Unable to put the emulator offline.")
    print("Airplane mode enabled, Wi-Fi and mobile data disabled.")
    adb("logcat", "-c", "-b", "main", "-b", "system", "-b", "crash", "-b", "events")


def install(apk, replace=False):
    install_flags = ["-r"] if replace else []
    result = adb("install", *install_flags, str(apk), timeout=90)
    require("Success" in result.splitlines(), f"APK installation failed: {result}")
    print(f"{'Reinstalled with existing data' if replace else 'Fresh install'}: {apk.name}")


def check_installed_package(output):
    installed_apk = adb("shell", "pm", "path", PACKAGE)
    require(installed_apk.startswith("package:") and installed_apk.endswith("/base.apk"),
            "The preview package was not installed.")
    package_dump = adb("shell", "dumpsys", "package", PACKAGE)
    (output / "installed-package.txt").write_text(package_dump + "\n")
    flags = re.findall(r"^\s*(?:pkgFlags|flags)=\[([^\]\r\n]*)\]", package_dump, re.MULTILINE)
    require(flags and all("DEBUGGABLE" not in flag.split() for flag in flags),
            "Could not confirm the installed package is non-debuggable. See installed-package.txt.")
    require("package not debuggable" in adb("shell", "run-as", PACKAGE, "id", check=False).lower(),
            "Android did not reject run-as for the installed APK.")
    print(f"Installed package flags: [{flags[0].strip()}]. Android rejected run-as.")


def capture_screenshot(path):
    screenshot = subprocess.check_output(["adb", "exec-out", "screencap", "-p"], timeout=20)
    require(screenshot.startswith(b"\x89PNG\r\n\x1a\n"), "Unable to save the Android screenshot.")
    path.write_bytes(screenshot)


class AppScreen:
    def __init__(self, output):
        self.output = output
        dimensions = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
        require(dimensions, "Unable to determine the display bounds.")
        self.width, self.height = map(int, dimensions[-1])

    def find(self, pattern, scroll=False):
        deadline = time.monotonic() + 55
        while time.monotonic() < deadline:
            adb("shell", "rm", "-f", WINDOW)
            adb("shell", "uiautomator", "dump", WINDOW, check=False)
            xml = adb("exec-out", "cat", WINDOW, check=False)
            try:
                tree = ET.fromstring(xml)
            except ET.ParseError:
                time.sleep(1)
                continue
            (self.output / "window.xml").write_text(xml + "\n")

            scroll_up = True
            for node in tree.iter("node"):
                if node.get("package") != PACKAGE:
                    continue
                names = (" ".join(node.get(field, "").split()) for field in ("text", "content-desc"))
                name = next((candidate for candidate in names if re.search(pattern, candidate)), "")
                bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
                if not name or not bounds:
                    continue
                left, top, right, bottom = map(int, bounds.groups())
                if right <= left or bottom <= top:
                    continue
                x, y = (left + right) // 2, (top + bottom) // 2
                if not scroll or self.height * 0.15 <= y <= self.height * 0.86:
                    print(f"Found {name}")
                    return x, y
                scroll_up = y > self.height * 0.86

            if scroll:
                start, end = (0.78, 0.43) if scroll_up else (0.43, 0.78)
                x = str(self.width // 2)
                adb("shell", "input", "swipe", x, str(int(self.height * start)), x, str(int(self.height * end)), "500")
            time.sleep(0.5)
        raise RuntimeError(f"Could not find {pattern!r} in the app. See window.xml and android.png.")

    def tap(self, pattern, scroll=False):
        x, y = self.find(pattern, scroll=scroll)
        adb("shell", "input", "tap", str(x), str(y))

    def launch_today(self):
        launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY, timeout=60)
        require("Status: ok" in launch, f"Unable to launch preview: {launch}")
        self.find(TODAY)

    def cards_complete(self, count):
        self.find(rf"^(?:Daily route: {count} of [1-9]\d* assigned cards completed\b.*|{count}/[1-9]\d*(?: today.s cards)?)$")

    def check_backup_chooser(self):
        self.tap(r"^Learning settings$")
        self.find(r"^Learning preferences$")
        backup_button = r"^Download Progress Backup$"
        self.tap(backup_button, scroll=True)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            activities = adb("shell", "dumpsys", "activity", "-a", "activities")
            (self.output / "backup-activities.txt").write_text(activities + "\n")
            if re.search(r"ResumedActivity\s*[:=][^\n]*ChooserActivity\b", activities, re.IGNORECASE):
                chooser = next((line.strip() for line in activities.splitlines()
                                if "act=android.intent.action.CHOOSER" in line and "ChooserActivity" in line), "")
                flags = re.search(r"\bflg=0x([0-9a-f]+)\b", chooser)
                if flags and int(flags[1], 16) & 1 and ("U(content)" in chooser or "U:content://" in chooser):
                    print("Android opened the share chooser with a readable backup content URI.")
                    capture_screenshot(self.output / "backup-chooser.png")
                    adb("shell", "input", "keyevent", "KEYCODE_BACK")
                    self.find(backup_button, scroll=True)
                    self.cards_complete(1)
                    print("Dismissed the chooser and returned to the app with saved progress.")
                    return
            time.sleep(1)
        raise RuntimeError("Backup share chooser did not open with a file attachment. See backup-activities.txt.")


def check_failures(output):
    exits = adb("shell", "dumpsys", "activity", "exit-info", PACKAGE)
    (output / "app-exits.txt").write_text(exits + "\n")
    events = adb("logcat", "-d", "-b", "events", "-s", "am_anr", "am_crash")
    (output / "crash-events.txt").write_text(events + "\n")
    crash_log = adb("logcat", "-d", "-b", "crash")
    (output / "crash-log.txt").write_text(crash_log + "\n")
    reasons = set(re.findall(rf"\bprocess={re.escape(PACKAGE)}(?:[:\w.-]*)\s+reason=(\d+)\b", exits))
    # Force stop reports USER_REQUESTED. Reinstall may report PACKAGE_UPDATED on API 34+.
    require(not reasons - {"10", "16"} and PACKAGE not in events and PACKAGE not in crash_log,
            "Android reported an unexpected app exit, crash or ANR. See the log artifacts.")
    print("Android app-exit, crash and ANR checks passed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("api")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        prepare_device(args.api)
        install(args.apk)
        check_installed_package(args.output)
        screen = AppScreen(args.output)
        screen.launch_today()
        screen.cards_complete(0)
        screen.tap(r"^Progress$")
        screen.find(r"^Small steps become\b")
        screen.tap(r"^Today$")
        screen.find(TODAY)
        screen.tap(r"^Reveal meaning$", scroll=True)
        screen.tap(r"^Good(?:[ ,]*3\+\s*days)?$", scroll=True)
        screen.cards_complete(1)
        print("Saved one review while offline.")
        adb("shell", "am", "force-stop", PACKAGE)
        screen.launch_today()
        screen.cards_complete(1)
        print("The review survived force stop and relaunch.")
        screen.check_backup_chooser()
        install(args.apk, replace=True)
        screen.launch_today()
        screen.cards_complete(1)
        print("The review survived reinstalling the same signed APK with adb install -r.")
    finally:
        capture_screenshot(args.output / "android.png")
        check_failures(args.output)


if __name__ == "__main__":
    main()
