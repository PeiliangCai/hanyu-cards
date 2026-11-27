"""Exercise the signed preview on a clean Android emulator through its accessibility tree."""

import argparse
import hashlib
import re
import struct
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import NamedTuple


PACKAGE = "com.hanyucards.app.preview"
ACTIVITY = f"{PACKAGE}/com.hanyucards.app.MainActivity"
TODAY = r"^Build a little Mandarin\b"
STUDY = r"^Study today.s cards$"
SETTINGS = r"^Learning settings$"
TUTOR = r"^Open AI tutor$"
REVEAL = r"^Reveal meaning$"
HANZI = r"^[\u3400-\u9fff]+$"
GRADES = (r"^Again\b", r"^Hard\b", r"^Good\b", r"^Easy\b")
NAV_LABELS = ("Today", "Missions", "Practice", "Words", "Progress")
WINDOW = "/sdcard/hanyu-beta-window.xml"
# From SHA256SUMS attached to the published v1.0.0-beta.1 prerelease.
PREVIOUS_APK_SHA256 = "6257152d9920c41cf4948c5841da74c3b39e1a2e703c3f5aba1e694851baaeeb"


class Bounds(NamedTuple):
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self):
        return self.right - self.left

    @property
    def height(self):
        return self.bottom - self.top

    @property
    def center(self):
        return (self.left + self.right) // 2, (self.top + self.bottom) // 2

    def contains(self, other):
        return (self.left <= other.left < other.right <= self.right
                and self.top <= other.top < other.bottom <= self.bottom)

    def contains_point(self, point):
        x, y = point
        return self.left <= x < self.right and self.top <= y < self.bottom


class Target(NamedTuple):
    name: str
    bounds: Bounds


def node_bounds(node):
    match = re.fullmatch(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", node.get("bounds", ""))
    if match:
        return Bounds(*map(int, match.groups()))
    return Bounds(0, 0, 0, 0)


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
    require(adb("shell", "getprop", "ro.kernel.qemu") == "1", "The smoke test requires an Android emulator.")
    require(not adb("shell", "pm", "path", PACKAGE, check=False).startswith("package:"),
            "The smoke test requires a clean emulator with no preview installed.")
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


def check_installed_package(output, version_code):
    installed_apk = adb("shell", "pm", "path", PACKAGE)
    require(installed_apk.startswith("package:") and installed_apk.endswith("/base.apk"),
            "The preview package was not installed.")
    package_dump = adb("shell", "dumpsys", "package", PACKAGE)
    (output / "installed-package.txt").write_text(package_dump + "\n")
    require(re.search(rf"(?m)^\s*versionCode={version_code}\b", package_dump),
            f"Expected installed version code {version_code}. See installed-package.txt.")
    flags = re.findall(r"^\s*(?:pkgFlags|flags)=\[([^\]\r\n]*)\]", package_dump, re.MULTILINE)
    require(flags and all("DEBUGGABLE" not in flag.split() for flag in flags),
            "Could not confirm the installed package is non-debuggable. See installed-package.txt.")
    require("package not debuggable" in adb("shell", "run-as", PACKAGE, "id", check=False).lower(),
            "Android did not reject run-as for the installed APK.")
    print(f"Installed package flags: [{flags[0].strip()}]. Android rejected run-as.")


def capture_screenshot(path, dimensions=None):
    screenshot = subprocess.check_output(["adb", "exec-out", "screencap", "-p"], timeout=20)
    require(len(screenshot) > 24 and screenshot.startswith(b"\x89PNG\r\n\x1a\n"),
            "Unable to save the Android screenshot.")
    path.write_bytes(screenshot)
    if dimensions:
        actual = struct.unpack(">II", screenshot[16:24])
        require(actual == dimensions, f"{path.name}: display is {actual}, expected {dimensions} pixels.")


def backup_chooser_has_read_grant(activities):
    resumed = re.search(r"(?m)^ *(?:topResumedActivity|ResumedActivity)\s*[:=]\s*ActivityRecord\{(\S+) u\d+ ([^\s}]+)", activities)
    if not resumed:
        return False
    record_id, component = resumed.groups()
    host, _, name = component.partition("/")
    if component != "android/com.android.internal.app.ChooserActivity" and not (
        host in {"com.android.intentresolver", "com.google.android.intentresolver"}
        and name.rsplit(".", 1)[-1] in {"ChooserActivity", "ChooserActivityLauncher"}
    ):
        return False

    # Read the history entry for the resumed activity, excluding adjacent activities.
    history = re.search(
        rf"(?m)^( *)\* Hist +#\d+: ActivityRecord\{{{re.escape(record_id)} u\d+ {re.escape(component)}(?=[ }}])[^\n]*\n"
        r"((?:\1 +[^\n]+\n)*)",
        activities,
    )
    if not history:
        return False
    details = history[2]
    intent = re.search(
        rf"(?m)^ *Intent \{{ act=android\.intent\.action\.CHOOSER\b[^\n]* flg=0x([0-9a-f]+) cmp={re.escape(component)}(?=[ }}])",
        details,
    )
    return bool(
        intent and int(intent[1], 16) & 1
        and re.search(rf"\blaunchedFromPackage={re.escape(PACKAGE)}(?=\s|$)", details)
        and re.search(
            rf"(?m)^ *readUriPermissions=\{{[^\n]* content://{re.escape(PACKAGE)}\.fileprovider/"
            r"shared_backups/hanyu-progress-\d{4}-\d{2}-\d{2}\.json(?=[ }])",
            details,
        )
    )


class AppScreen:
    def __init__(self, output, rotation=0, phone=False):
        self.output = output
        self.output.mkdir(parents=True, exist_ok=True)
        self.rotation = rotation
        self.phone = phone
        dimensions = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
        densities = re.findall(r"(?:Physical|Override) density: (\d+)", adb("shell", "wm", "density"))
        require(dimensions and densities, "Unable to determine the display size and density.")
        self.width, self.height = map(int, dimensions[-1])
        if rotation % 2:
            self.width, self.height = self.height, self.width
        self.density = int(densities[-1])

    def dp(self, size):
        return round(size * self.density / 160)

    def read_window(self):
        adb("shell", "rm", "-f", WINDOW)
        adb("shell", "uiautomator", "dump", WINDOW, check=False)
        xml = adb("exec-out", "cat", WINDOW, check=False)
        try:
            tree = ET.fromstring(xml)
        except ET.ParseError:
            return False
        (self.output / "window.xml").write_text(xml + "\n")
        if tree.get("rotation") != str(self.rotation):
            return False
        self.xml = xml
        self.nodes = [node for node in tree.iter("node") if node.get("package") == PACKAGE]
        for node in self.nodes:
            if node.get("class") == "android.webkit.WebView":
                self.viewport = node_bounds(node)
                if self.viewport.width > 0 and self.viewport.height > 0:
                    return True
        return False

    def target(self, pattern, action=False):
        for node in self.nodes:
            if action and (node.get("clickable") != "true" or node.get("enabled") != "true"):
                continue
            bounds = node_bounds(node)
            if bounds.width <= 0 or bounds.height <= 0:
                continue
            for field in ("text", "content-desc"):
                name = " ".join(node.get(field, "").split())
                if re.search(pattern, name):
                    return Target(name, bounds)
        return None

    def visible_area(self, content=False):
        left, top, right, bottom = self.viewport
        bottom -= self.dp(2)
        if content:
            header = self.target(SETTINGS, action=True)
            nav = self.target(r"^Primary$")
            if header:
                top = max(top, header.bounds.bottom + self.dp(6))
            if nav:
                bottom = min(bottom, nav.bounds.top)
        # UI Automator clips reported bounds. Require an inset from both display edges.
        return Bounds(left + self.dp(4), top + self.dp(2), right - self.dp(4), bottom)

    def visibility_issue(self, target, area, action=False, content=False, minimum=None):
        if not target:
            return "no visible accessibility node"
        bounds = target.bounds
        if not area.contains(bounds):
            return f"{bounds} leaves the unobscured area {area}"
        touch_size = minimum if minimum is not None else (43 if self.phone and action else 1)
        if min(bounds.width, bounds.height) < self.dp(touch_size):
            return f"{bounds} is smaller than {touch_size} dp in one direction"
        if content:
            tutor = self.target(TUTOR, action=True)
            if tutor and tutor.bounds.contains_point(bounds.center):
                return f"the tutor obscures the center of {bounds}"
        return ""

    def find_many(self, patterns, *, action=False, content=False, scroll=None, minimum=None):
        deadline = time.monotonic() + 45
        issues = []
        while time.monotonic() < deadline:
            if not self.read_window():
                time.sleep(0.5)
                continue
            area = self.visible_area(content)
            targets = [self.target(pattern, action) for pattern in patterns]
            issues = [
                (pattern, self.visibility_issue(target, area, action, content, minimum))
                for pattern, target in zip(patterns, targets)
            ]
            if not any(issue for _, issue in issues):
                for target in targets:
                    print(f"Visible {target.name}: {target.bounds}")
                return targets
            if scroll:
                scroll_area = self.visible_area(content=True)
                require(scroll_area.height >= self.dp(80), f"The scrollable area is too short: {scroll_area}.")
                x = scroll_area.center[0]
                # A smaller step lets both rows of rating buttons come into view in landscape.
                start = scroll_area.top + round(scroll_area.height * 0.77)
                end = scroll_area.top + round(scroll_area.height * (0.47 if len(patterns) > 1 else 0.37))
                visible_targets = [target for target in targets if target]
                under_header = visible_targets and min(target.bounds.top for target in visible_targets) < area.top
                if scroll == "up" or under_header:
                    start, end = end, start
                adb("shell", "input", "swipe", str(x), str(start), str(x), str(end), "650")
            time.sleep(0.3)
        details = ", ".join(f"{pattern}: {issue}" for pattern, issue in issues if issue)
        raise RuntimeError(f"Unable to reach {patterns!r}. {details}. See {self.output.name}/window.xml.")

    def find(self, pattern, **options):
        return self.find_many((pattern,), **options)[0]

    def press(self, target):
        x, y = target.bounds.center
        adb("shell", "input", "tap", str(x), str(y))

    def tap(self, pattern, **options):
        self.press(self.find(pattern, action=True, **options))

    def snapshot(self, name):
        capture_screenshot(self.output / f"{name}.png", (self.width, self.height))
        (self.output / f"{name}.xml").write_text(self.xml + "\n")

    def check_phone_layout(self):
        self.find(STUDY, action=True, content=True)
        self.snapshot("today")
        viewport = self.viewport
        require(Bounds(0, 0, self.width, self.height).contains(viewport)
                and viewport.width >= self.width - self.dp(80)
                and viewport.height >= self.height - self.dp(90),
                f"The app WebView does not fill the usable display: {viewport}.")

        def check(pattern, area, action=False, content=False):
            target = self.target(pattern, action)
            issue = self.visibility_issue(target, area, action, content)
            require(not issue, f"{pattern}: {issue}. See today.xml and today.png.")
            print(f"Visible {target.name}: {target.bounds}")
            return target.bounds

        check(TODAY, self.visible_area(content=True), content=True)
        brand = check(r"^HanYu Cards home$", self.visible_area(), action=True)
        settings = check(SETTINGS, self.visible_area(), action=True)
        require(brand.right <= settings.left and brand.left < viewport.left + viewport.width * 0.22
                and settings.right > viewport.right - viewport.width * 0.22,
                "The home and settings controls must be reachable at opposite edges of the header.")
        nav = check(r"^Primary$", self.visible_area())
        tutor = check(TUTOR, self.visible_area(), action=True)
        nav_items = [check(rf"^{label}$", nav, action=True) for label in NAV_LABELS]
        for left, right in zip(nav_items, nav_items[1:]):
            require(left.right <= right.left + self.dp(3) and abs(left.center[1] - right.center[1]) <= self.dp(3),
                    "The primary navigation links overlap or do not fit in a single row.")
        require(all(not tutor.contains_point(item.center) for item in nav_items),
                "The tutor obscures a primary navigation link.")

    def launch_today(self):
        launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY, timeout=60)
        require("Status: ok" in launch, f"Unable to launch preview: {launch}")
        self.find(TODAY)

    def cards_complete(self, count, scroll=None):
        return self.find(rf"^Daily route: {count} of [1-9]\d* assigned cards completed\b", scroll=scroll)

    def check_tutor(self):
        self.tap(TUTOR)
        full_height = self.viewport.height
        self.find(r"^Local study notes$")
        close = self.find(r"^Close AI tutor$", action=True)
        require(self.viewport.height >= full_height - self.dp(8),
                "The Android keyboard opened before the learner tapped the tutor composer.")
        self.snapshot("tutor")

        if self.rotation:
            # Older WebViews expose the editable node without its ARIA name in UI Automator.
            editors = [node for node in self.nodes if node.get("class") == "android.widget.EditText"
                       and node.get("enabled") == "true" and node.get("clickable") == "true"]
            require(len(editors) == 1, "Expected one editable field in the tutor.")
            composer = Target("Message to tutor", node_bounds(editors[0]))
            issue = self.visibility_issue(composer, self.visible_area(), action=True)
            require(not issue, f"{composer.name}: {issue}.")
            self.press(composer)
            adb("shell", "input", "text", "Review")
            self.find(r"^Send message$", action=True)
            require(self.viewport.height <= full_height - self.dp(48),
                    "The app did not resize for the Android keyboard after tapping the composer.")
            self.snapshot("tutor-keyboard")

            adb("shell", "input", "keyevent", "KEYCODE_BACK")
            self.find(r"^Local study notes$")
            close = self.find(r"^Close AI tutor$", action=True)
            require(self.viewport.height >= full_height - self.dp(8),
                    "The Android keyboard did not dismiss when Back was pressed.")
            print("The tutor accepted input with the Android keyboard open and remained open after Back dismissed it.")

        self.press(close)

    def check_backup_chooser(self, count):
        self.tap(SETTINGS)
        self.find(r"^Learning preferences$", content=True)
        backup_button = r"^Download Progress Backup$"
        self.tap(backup_button, content=True, scroll="down")
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            activities = adb("shell", "dumpsys", "activity", "-a", "activities")
            (self.output / "backup-activities.txt").write_text(activities + "\n")
            if backup_chooser_has_read_grant(activities):
                print("Android opened the share chooser with a read grant for the backup JSON.")
                capture_screenshot(self.output / "backup-chooser.png")
                adb("shell", "input", "keyevent", "KEYCODE_BACK")
                self.find(backup_button, content=True)
                self.cards_complete(count, scroll="up")
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


def phone_screen(output, width, height, rotation=0):
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "wm", "density", "320")
    natural_width, natural_height = (height, width) if rotation else (width, height)
    adb("shell", "wm", "size", f"{natural_width * 2}x{natural_height * 2}")
    adb("shell", "wm", "user-rotation", "lock", str(rotation))
    screen = AppScreen(output, rotation=rotation, phone=True)
    require((screen.width, screen.height, screen.density) == (width * 2, height * 2, 320),
            "Android did not apply the requested phone dimensions and density.")
    print(f"Checking {width}×{height} dp at {screen.density} dpi, rotation {rotation}.")
    screen.launch_today()
    return screen


def review_on_phone(screen, completed):
    screen.cards_complete(completed)
    screen.check_phone_layout()
    screen.check_tutor()
    screen.tap(r"^Progress$")
    screen.find(r"^Small steps become\b", content=True)
    screen.snapshot("progress")
    screen.tap(r"^Today$")
    screen.tap(STUDY, content=True)
    screen.find(HANZI, content=True, minimum=32)
    screen.snapshot("word")
    screen.find(r"^Play pronunciation$", action=True, content=True)
    screen.tap(REVEAL, content=True, scroll="down")
    screen.find(re.compile(r"^meaning$", re.IGNORECASE), content=True, scroll="down", minimum=8)
    screen.snapshot("meaning")
    grades = screen.find_many(GRADES, action=True, content=True, scroll="down")
    screen.snapshot("grades")
    require(all(not other.bounds.contains_point(grade.bounds.center)
                for grade in grades for other in grades if grade is not other),
            "A review rating obscures another rating's tap target.")
    screen.press(grades[2])
    screen.cards_complete(completed + 1, scroll="up")
    print("Saved one more offline review by tapping the rating on its measured center.")


def check_upgrade(old_apk, new_apk, new_version_code, output):
    previous = AppScreen(output / "beta1-before-upgrade")
    with old_apk.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    require(digest == PREVIOUS_APK_SHA256, "The upgrade baseline does not match the published beta.1 SHA-256.")
    (previous.output / "SHA256SUMS").write_text(f"{digest}  {old_apk.name}\n")
    print(f"Published beta.1 APK SHA-256 verified: {digest}.")

    install(old_apk)
    check_installed_package(previous.output, 1)
    previous.launch_today()
    previous.cards_complete(0)
    previous.tap(REVEAL, content=True, scroll="down")
    previous.tap(GRADES[2], content=True, scroll="down")
    saved_progress = previous.cards_complete(1).name
    previous.snapshot("progress-before-upgrade")

    install(new_apk, replace=True)
    upgraded = AppScreen(output / "beta2-after-upgrade")
    check_installed_package(upgraded.output, new_version_code)
    upgraded.launch_today()
    require(upgraded.cards_complete(1).name == saved_progress,
            "The saved daily route changed during the in-place upgrade from beta.1.")
    upgraded.snapshot("progress-after-upgrade")
    print("The published beta.1 review and daily target survived the in-place upgrade to beta.2.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("api")
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--previous-apk", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    prepare_device(args.api)
    try:
        install(args.apk)
        check_installed_package(args.output, args.version_code)
        profiles = ((320, 640, 0), (640, 320, 1), (360, 720, 0))
        for completed, (width, height, rotation) in enumerate(profiles):
            screen = phone_screen(args.output / f"{width}x{height}dp", width, height, rotation)
            review_on_phone(screen, completed)
        # Reserve the last portrait size for checking the native chooser after a cold start.
        adb("shell", "am", "force-stop", PACKAGE)
        screen.launch_today()
        screen.cards_complete(len(profiles))
        print("All offline reviews survived force stop and relaunch.")
        screen.check_backup_chooser(len(profiles))
        check_failures(args.output)

        adb("uninstall", PACKAGE)
        adb("shell", "wm", "size", "reset")
        adb("shell", "wm", "density", "reset")
        check_upgrade(args.previous_apk, args.apk, args.version_code, args.output)
    finally:
        capture_screenshot(args.output / "android.png")
        check_failures(args.output)


if __name__ == "__main__":
    main()
