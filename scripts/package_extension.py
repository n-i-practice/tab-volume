"""Package the committed Chrome extension and record its source revision."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from zipfile import ZIP_STORED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = "extension/"


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="HEAD", help="Git revision to package (default: HEAD)")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    args = parser.parse_args()

    commit = git("rev-parse", "--verify", "--end-of-options", args.ref + "^{commit}").decode().strip()
    manifest = json.loads(git("show", f"{commit}:{EXTENSION}manifest.json"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    archive = args.output_dir / f"tab-volume-{manifest['version']}.zip"
    entries = git("ls-tree", "-r", "-z", commit, EXTENSION).rstrip(b"\0").split(b"\0")

    with ZipFile(archive, "w", compression=ZIP_STORED) as output:
        for entry in sorted(entries, key=lambda value: value.partition(b"\t")[2]):
            metadata, raw_path = entry.split(b"\t", 1)
            mode, kind, object_id = metadata.decode().split()
            if kind != "blob" or mode not in ("100644", "100755"):
                raise ValueError(f"Expected a regular file under {EXTENSION}")
            info = ZipInfo(raw_path.decode("utf-8").removeprefix(EXTENSION))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            output.writestr(info, git("cat-file", "blob", object_id))

    metadata = {
        "filename": archive.name,
        "commit": commit,
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "files": len(entries),
    }
    archive.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(archive)


if __name__ == "__main__":
    main()
