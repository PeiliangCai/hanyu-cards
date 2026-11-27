"""Check the packaged preview APK with the Android 35.0.0 build tools."""

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from zipfile import ZipFile


PACKAGE = "com.hanyucards.app.preview"
ACTIVITY = "com.hanyucards.app.MainActivity"
RECEIVER_PERMISSION = f"{PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
PERMISSIONS = {"android.permission.INTERNET", "android.permission.VIBRATE", RECEIVER_PERMISSION}
CREDENTIAL_FILE = re.compile(
    r"(?:^|/)(?:\.env(?:[./]|$)|\.git/|\.npmrc$|google-services\.json$|"
    r"key\.properties$|id_rsa$|id_ed25519$)|\.(?:jks|keystore|p12|pfx|pem|key)$",
    re.IGNORECASE,
)
CREDENTIAL_TEXT = re.compile(
    rb"\b(?:OPENAI_API_KEY|AGICTO_API_KEY|ASSISTANT_PROXY_SECRET|VITE_ASSISTANT_PROXY_SECRET)\b|"
    rb"\b(?:sk-[a-z0-9_-]{24,}|gh[pousr]_[a-z0-9]{30,}|github_pat_[a-z0-9_]{30,})\b|"
    rb"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|api\.(?:openai\.com|agicto\.cn)",
    re.IGNORECASE,
)
MEDIA_RULE = re.compile(rb"@media\s*([^{}]+)\{")
PHONE_BREAKPOINT = re.compile(rb"\(\s*max-width\s*:\s*720px\s*\)")


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def check_manifest(aapt, apk, output, version, version_code):
    badging = subprocess.check_output([aapt, "dump", "badging", apk], text=True)
    (output / "manifest.txt").write_text(badging)
    lines = badging.splitlines()
    require(
        lines and lines[0].startswith(f"package: name='{PACKAGE}' versionCode='{version_code}' versionName='{version}' "),
        "Unexpected package or version metadata. See manifest.txt.",
    )
    for expected in ("sdkVersion:'23'", "targetSdkVersion:'35'", "application-label:'HanYu Cards Preview'"):
        require(expected in lines, f"Missing APK metadata {expected}.")
    activities = [line for line in lines if line.startswith("launchable-activity:")]
    require(len(activities) == 1 and activities[0].startswith(f"launchable-activity: name='{ACTIVITY}' "),
            "Unexpected launcher activity.")
    require("application-debuggable" not in lines, "The APK manifest enables debugging.")

    permissions = set(re.findall(r"^uses-permission(?:-sdk-\d+)?: name='([^']+)'", badging, re.MULTILINE))
    require(permissions == PERMISSIONS, f"Unexpected requested permissions: {sorted(permissions)}.")
    manifest = subprocess.check_output([aapt, "dump", "xmltree", apk, "AndroidManifest.xml"], text=True)
    (output / "manifest-tree.txt").write_text(manifest)
    definitions = re.findall(r"^ {4}E: permission \([^\n]*\)\n((?: {6}A: [^\n]+\n)*)", manifest, re.MULTILINE)
    require(len(definitions) == 1 and f'="{RECEIVER_PERMISSION}"' in definitions[0]
            and re.search(r"android:protectionLevel\([^)]*\)=\(type 0x11\)0x2\n", definitions[0]),
            "The merged manifest must define only the preview's signature-protected receiver permission.")
    require("android:sharedUserId(" not in manifest, "The APK sets a shared user ID.")
    require(not re.search(r"android:(?:testOnly|usesCleartextTraffic)\([^)]*\)=\(type 0x12\)0xffffffff", manifest),
            "The APK enables test-only installation or cleartext traffic.")

    resources = subprocess.check_output([aapt.with_name("aapt2"), "dump", "resources", apk], text=True)
    paths_resource = re.search(r"^ +resource 0x[0-9a-f]+ xml/file_paths\n((?: {6}[^\n]+\n)+)", resources, re.MULTILINE)
    require(paths_resource, "Missing FileProvider path resource.")
    path_files = re.findall(r"\(file\) (\S+) type=XML", paths_resource.group(1))
    require(len(path_files) == 1, "The FileProvider must have one path resource.")
    paths = subprocess.check_output([aapt, "dump", "xmltree", apk, path_files[0]], text=True)
    (output / "file-provider-paths.txt").write_text(paths)
    require(re.findall(r"^ *E: ([\w-]+)", paths, re.MULTILINE) == ["paths", "cache-path"]
            and 'name="shared_backups"' in paths and 'path="shared-backups/"' in paths,
            "The backup FileProvider must be restricted to the shared-backups cache directory.")
    print(f"Package {PACKAGE}, version {version} ({version_code}), min SDK 23, target SDK 35, non-debuggable.")
    print(f"Requested permissions: {', '.join(sorted(permissions))}.")


def check_assets(apk):
    with ZipFile(apk) as archive:
        entries = archive.namelist()
        require(len(entries) == len(set(entries)), "The APK contains duplicate entries.")
        require("assets/public/index.html" in entries, "Bundled web entry point is missing.")
        media_rules = []
        for entry in entries:
            require(not CREDENTIAL_FILE.search(entry), f"Unexpected credential file in APK: {entry}.")
            suffix = Path(entry).suffix
            if entry.startswith("assets/") and suffix in {".js", ".json", ".html", ".css", ".map", ".txt"}:
                content = archive.read(entry)
                require(not CREDENTIAL_TEXT.search(content),
                        f"Unexpected credential or direct provider endpoint in {entry}.")
                if suffix == ".css" and entry.startswith("assets/public/") and b".app-shell" in content:
                    media_rules.extend(MEDIA_RULE.findall(content))

        require(any(PHONE_BREAKPOINT.search(rule) for rule in media_rules)
                and not any(b"<" in rule or b">" in rule for rule in media_rules),
                "The bundled app stylesheet must preserve the phone breakpoint syntax for older WebViews.")

        config = json.loads(archive.read("assets/capacitor.config.json"))
        server = config.get("server", {})
        require(server.get("androidScheme") == "https" and not any(
            server.get(field) for field in ("url", "allowNavigation", "cleartext")
        ), "Capacitor must serve local assets over its HTTPS origin.")
        require(not config.get("android", {}).get("webContentsDebuggingEnabled"),
                "Capacitor enables WebView debugging.")
    print("Bundled asset and Capacitor configuration checks passed.")


def check_signature(apksigner, apk, output, expected_signer):
    result = subprocess.run(
        [apksigner, "verify", "--verbose", "--print-certs", "--min-sdk-version", "23", apk],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False,
    )
    (output / "signature.txt").write_text(result.stdout)
    if expected_signer is None:
        require(result.returncode != 0 and "Missing META-INF/MANIFEST.MF" in result.stdout,
                "The preview build must produce an unsigned APK. See signature.txt.")
        print("Unsigned APK ready for the preview signer.")
        return

    require(result.returncode == 0, "APK signature verification failed. See signature.txt.")
    certs = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})$", result.stdout, re.MULTILINE)
    require(certs == [expected_signer] and "CN=Android Debug" not in result.stdout,
            "The APK must have one signer matching the preview signing certificate.")
    require(re.search(r"^Verified using v1 scheme .*: true$", result.stdout, re.MULTILINE)
            and re.search(r"^Verified using v2 scheme .*: true$", result.stdout, re.MULTILINE),
            "The APK must verify with signature schemes v1 and v2.")
    print(f"APK signature verified. Preview certificate SHA-256 {certs[0]}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--signer-sha256")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    build_tools = Path(os.environ["ANDROID_HOME"]) / "build-tools" / "35.0.0"
    check_manifest(build_tools / "aapt", args.apk, args.output, args.version, args.version_code)
    check_assets(args.apk)
    check_signature(build_tools / "apksigner", args.apk, args.output, args.signer_sha256)


if __name__ == "__main__":
    main()
