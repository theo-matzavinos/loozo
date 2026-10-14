#!/usr/bin/env python3
"""Authenticate and extract pinned Ubuntu libraries into an explicit private runtime.

Requires Linux x86_64, Python 3, curl, gpg/gpgv, ar, tar (xz/zstd), ldd.
No privilege, package scripts, loader replacement, browser patch or host installation.
"""
import argparse
import hashlib
import json
import lzma
import os
from pathlib import Path
import platform
import subprocess

FINGERPRINT = "F6ECB3762474EDA9D21B7022871920D1991BC93C"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--runtime-root", required=True, type=Path)
parser.add_argument("--webkit-bundle", required=True, type=Path,
                    help="Matching genuine Playwright webkit-2359 directory")
args = parser.parse_args()
assert platform.system() == "Linux" and platform.machine() == "x86_64"
runtime = args.runtime_root.resolve()
bundle = args.webkit_bundle.resolve()
assert runtime.is_absolute() and str(runtime) != "/"
repository = Path(__file__).resolve().parents[2]
assert not runtime.is_relative_to(repository), "Runtime payload must remain outside the repository"
for system in ["/usr", "/lib", "/lib64", "/bin", "/sbin", "/etc", "/var", "/boot"]:
    assert not runtime.is_relative_to(system), "No system package installation is allowed"
assert bundle.name == "webkit-2359", "Use the pinned Playwright 1.63.0 SDK"
manifest_path = Path(__file__).with_name("webkit-packages.json")
manifest_data = manifest_path.read_bytes()
manifest = json.loads(manifest_data)
metadata = runtime / "metadata"
downloads = runtime / "downloads"
root = runtime / "root"
for directory in [metadata, downloads, root]:
    directory.mkdir(parents=True, exist_ok=True)
# Remove the success stamp before verification: a failed rerun must not look ready.
receipt_path = metadata / "setup-receipt.json"
receipt_path.unlink(missing_ok=True)


def download(url, destination):
    if destination.exists():
        return
    temporary = destination.with_suffix(destination.suffix + ".partial")
    subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                    "--max-time", "180", url, "-o", str(temporary)], check=True)
    temporary.replace(destination)


def verified_bytes(filename, expected_size, expected_hash):
    data = filename.read_bytes()
    assert len(data) == expected_size, f"Size mismatch: {filename}"
    assert hashlib.sha256(data).hexdigest() == expected_hash, f"SHA-256 mismatch: {filename}"
    return data


keyring = metadata / "official-archive-keyring.gpg"
download("https://archive.ubuntu.com/ubuntu/project/ubuntu-archive-keyring.gpg", keyring)
gnupg = runtime / "gnupg"
gnupg.mkdir(exist_ok=True, mode=0o700)
keys = subprocess.check_output(["gpg", "--homedir", str(gnupg), "--batch", "--show-keys",
                                "--with-colons", str(keyring)], text=True)
assert f"fpr:::::::::{FINGERPRINT}:" in keys
(metadata / "archive-key-fingerprints.txt").write_text(keys)
index_records = {}
for suite in ["noble", "noble-security", "noble-updates"]:
    base = "https://archive.ubuntu.com/ubuntu"
    if suite == "noble-security":
        base = "https://security.ubuntu.com/ubuntu"
    release = metadata / f"{suite}.InRelease"
    download(f"{base}/dists/{suite}/InRelease", release)
    signature = subprocess.run(["gpgv", "--status-fd", "1", "--keyring", str(keyring), str(release)],
                               text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    assert f"[GNUPG:] VALIDSIG {FINGERPRINT} " in signature.stdout
    (metadata / f"{suite}-signature.log").write_text(signature.stdout + signature.stderr)
    hashes = {}
    section = release.read_text().split("SHA256:\n", 1)[1].split("\nSHA512:", 1)[0]
    for line in section.splitlines():
        fields = line.split()
        if len(fields) == 3 and len(fields[0]) == 64:
            hashes[fields[2]] = (fields[0], int(fields[1]))
    for component in ["main", "universe"]:
        relative = f"{component}/binary-amd64/Packages.xz"
        filename = metadata / f"{suite}-{component}-Packages.xz"
        download(f"{base}/dists/{suite}/{relative}", filename)
        checksum, size = hashes[relative]
        data = verified_bytes(filename, size, checksum)
        for paragraph in lzma.decompress(data).decode().split("\n\n"):
            record = {}
            for line in paragraph.splitlines():
                if line and not line[0].isspace() and ": " in line:
                    key, value = line.split(": ", 1)
                    record[key] = value
            name = record.get("Package")
            if name:
                index_records[(suite, name)] = record

packages = []
for package in manifest["packages"]:
    record = index_records.get((package["suite"], package["name"]))
    assert record, f"Pinned package no longer in signed indices: {package['name']}"
    assert record["Version"] == package["version"], "Pin changed: review required, no substitution"
    assert record["Architecture"] == "amd64"
    assert record["SHA256"] == package["sha256"] and int(record["Size"]) == package["bytes"]
    assert package["url"].endswith("/" + record["Filename"])
    filename = downloads / Path(record["Filename"]).name
    download(package["url"], filename)
    verified_bytes(filename, package["bytes"], package["sha256"])
    members = subprocess.check_output(["ar", "t", str(filename)], text=True).splitlines()
    archives = [member for member in members if member.startswith("data.tar.")]
    assert len(archives) == 1
    archive = downloads / f"{package['name']}-{archives[0]}"
    with archive.open("wb") as destination:
        subprocess.run(["ar", "p", str(filename), archives[0]], stdout=destination, check=True)
    listing = subprocess.check_output(["tar", "-tf", str(archive)], text=True).splitlines()
    assert all(not member.startswith("/") and ".." not in Path(member).parts for member in listing)
    subprocess.run(["tar", "-xf", str(archive), "-C", str(root), "--no-same-owner"], check=True)
    packages.append(package)

library = root / "usr/lib/x86_64-linux-gnu"
environment = dict(os.environ)
environment["LD_LIBRARY_PATH"] = f"{library}:{bundle}/minibrowser-wpe/lib:{bundle}/minibrowser-wpe/sys/lib"
checks = []
targets = list((bundle / "minibrowser-wpe/bin").iterdir())
for filename in library.rglob("*"):
    if filename.is_file() and not filename.is_symlink() and ".so" in filename.name:
        targets.append(filename)
for filename in targets:
    result = subprocess.run(["ldd", "-r", str(filename)], env=environment, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    checks.append(f"\n{filename}\n{result.stdout}")
    assert result.returncode == 0 and "not found" not in result.stdout and "undefined symbol" not in result.stdout, result.stdout
(metadata / "relocation-closure.log").write_text("".join(checks))
files = []
links = []
for filename in sorted(root.rglob("*")):
    if filename.is_symlink():
        links.append(f"{filename.relative_to(root)} -> {os.readlink(filename)}")
    elif filename.is_file():
        checksum = hashlib.sha256(filename.read_bytes()).hexdigest()
        files.append(f"{checksum}  {filename.relative_to(root)}")
(metadata / "extracted-files.sha256").write_text("\n".join(files) + "\n")
(metadata / "extracted-symlinks.txt").write_text("\n".join(links) + "\n")
receipt = {"status": "authenticated-relocations-passed", "productQualification": False,
           "manifestSha256": hashlib.sha256(manifest_data).hexdigest(),
           "signingFingerprint": FINGERPRINT, "packages": packages,
           "webkitBundle": str(bundle), "root": str(root)}
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
print(f"Verified {len(packages)} pinned packages; private root: {root}")
