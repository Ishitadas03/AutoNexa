"""AutoNexa - Database & Storage Backup, Verification, and Restore Tool (Phase 16F)

Provides deterministic, crash-safe backups for AutoNexa's SQLite metadata database
(using the SQLite Online Backup API to safely capture WAL state) and file artifacts
(uploads and experiment models).
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tarfile
from pathlib import Path
from typing import Any, Dict, List, Optional

# Allowlist of permitted top-level components within an AutoNexa backup archive
ALLOWED_TOP_LEVEL_COMPONENTS = {"manifest.json", "metadata.db", "uploads", "experiments"}


def compute_sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def safe_sqlite_backup(source_db_path: Path, target_db_path: Path) -> Dict[str, Any]:
    """Safely back up an active SQLite database in WAL mode using the SQLite Online Backup API."""
    target_db_path.parent.mkdir(parents=True, exist_ok=True)
    if target_db_path.exists():
        target_db_path.unlink()

    src_conn = sqlite3.connect(str(source_db_path), timeout=10.0)
    dst_conn = sqlite3.connect(str(target_db_path))

    try:
        # Online backup locks gracefully without blocking active readers
        src_conn.backup(dst_conn)
        dst_conn.commit()
    finally:
        dst_conn.close()
        src_conn.close()

    # Query table row counts from backed up copy
    verify_conn = sqlite3.connect(str(target_db_path))
    cursor = verify_conn.cursor()
    tables = [row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    table_counts = {}
    for tbl in tables:
        count = cursor.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        table_counts[tbl] = count
    verify_conn.close()

    return {
        "file_size_bytes": target_db_path.stat().st_size,
        "sha256": compute_sha256(target_db_path),
        "table_counts": table_counts,
    }


def create_backup(
    base_dir: Path,
    output_dir: Path,
    db_rel_path: str = "data/metadata.db",
    include_uploads: bool = True,
    include_experiments: bool = True,
) -> Path:
    """Create a self-contained, timestamped backup archive with manifest."""
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    backup_name = f"autonexa_backup_{timestamp}"
    staging_dir = output_dir / f".staging_{backup_name}"
    staging_dir.mkdir(parents=True, exist_ok=True)

    archive_path = output_dir / f"{backup_name}.tar.gz"

    try:
        manifest: Dict[str, Any] = {
            "backup_name": backup_name,
            "created_at_utc": timestamp,
            "version": "1.0",
            "components": {},
        }

        # 1. Back up SQLite metadata database safely
        src_db = (base_dir / db_rel_path).resolve()
        if src_db.exists():
            staged_db = staging_dir / "metadata.db"
            db_meta = safe_sqlite_backup(src_db, staged_db)
            manifest["components"]["database"] = {
                "source_rel_path": db_rel_path,
                "backup_filename": "metadata.db",
                **db_meta,
            }
        else:
            manifest["components"]["database"] = {"status": "not_found", "source_rel_path": db_rel_path}

        # 2. Stage uploads
        src_uploads = (base_dir / "uploads").resolve()
        if include_uploads and src_uploads.exists() and any(src_uploads.iterdir()):
            staged_uploads = staging_dir / "uploads"
            shutil.copytree(src_uploads, staged_uploads, dirs_exist_ok=True)
            manifest["components"]["uploads"] = {
                "file_count": sum(1 for _ in staged_uploads.rglob("*") if _.is_file()),
            }

        # 3. Stage experiments
        src_experiments = (base_dir / "experiments").resolve()
        if include_experiments and src_experiments.exists() and any(src_experiments.iterdir()):
            staged_experiments = staging_dir / "experiments"
            shutil.copytree(src_experiments, staged_experiments, dirs_exist_ok=True)
            manifest["components"]["experiments"] = {
                "file_count": sum(1 for _ in staged_experiments.rglob("*") if _.is_file()),
            }

        # 4. Write manifest
        manifest_file = staging_dir / "manifest.json"
        manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        # 5. Pack archive
        with tarfile.open(archive_path, "w:gz") as tar:
            for item in staging_dir.iterdir():
                tar.add(item, arcname=item.name)

        print(f"Successfully created backup archive: {archive_path}")
        print(f"Manifest: {json.dumps(manifest['components'], indent=2)}")
        return archive_path

    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)


def validate_archive_member(member: tarfile.TarInfo, destination_root: Path) -> Path:
    r"""Validate an individual tar archive member against traversal attacks and unauthorized files.

    Rejects:
    - Absolute POSIX paths (/etc/...)
    - Windows drive-qualified paths (C:\..., D:/...)
    - Windows UNC network paths (\\server\..., //server/...)
    - Directory traversal sequences ('..' anywhere in normalized path)
    - Symlinks, hardlinks, FIFOs, device nodes, or special archive members
    - Files outside the designated extraction root
    - Unexpected top-level components not in ALLOWED_TOP_LEVEL_COMPONENTS
    """
    raw_name = member.name
    if not raw_name or not raw_name.strip():
        raise ValueError("Invalid archive: empty member filename.")

    # 1. Normalize path separators to forward slash
    norm_name = raw_name.replace("\\", "/")

    # 2. Reject absolute POSIX paths and UNC network paths
    if norm_name.startswith("/") or norm_name.startswith("//") or raw_name.startswith("\\\\"):
        raise ValueError(f"Insecure archive member: absolute or UNC path detected: '{raw_name}'")

    # 3. Reject Windows drive-qualified paths (e.g. C:, D:)
    if bool(re.match(r"^[a-zA-Z]:", norm_name)):
        raise ValueError(f"Insecure archive member: Windows drive-qualified path detected: '{raw_name}'")

    # 4. Reject directory traversal sequences
    path_obj = Path(norm_name)
    if ".." in path_obj.parts:
        raise ValueError(f"Insecure archive member: directory traversal '..' detected: '{raw_name}'")

    # 5. Reject links and special file types (only regular files and directories permitted)
    if member.issym():
        raise ValueError(f"Insecure archive member: symbolic link rejected: '{raw_name}' -> '{member.linkname}'")
    if member.islnk():
        raise ValueError(f"Insecure archive member: hard link rejected: '{raw_name}' -> '{member.linkname}'")
    if not (member.isreg() or member.isdir()):
        raise ValueError(f"Insecure archive member: special file type rejected: '{raw_name}'")

    # 6. Top-level allowlist validation
    top_component = norm_name.strip("/").split("/")[0]
    if top_component not in ALLOWED_TOP_LEVEL_COMPONENTS:
        raise ValueError(
            f"Unauthorized archive member: top-level component '{top_component}' is not in allowed list "
            f"{sorted(ALLOWED_TOP_LEVEL_COMPONENTS)}."
        )

    # 7. Destination path resolution and containment check
    resolved_root = destination_root.resolve()
    resolved_dest = (destination_root / norm_name).resolve()

    if not resolved_dest.is_relative_to(resolved_root):
        raise ValueError(
            f"Path traversal detected: member '{raw_name}' resolves to '{resolved_dest}', "
            f"which escapes destination root '{resolved_root}'."
        )

    return resolved_dest


def validate_archive_members(tar: tarfile.TarFile, destination_root: Path) -> List[tarfile.TarInfo]:
    """Validate all members of an archive before any extraction begins."""
    members = tar.getmembers()
    if not members:
        raise ValueError("Invalid archive: archive contains no members.")

    for member in members:
        validate_archive_member(member, destination_root)

    return members


def verify_backup(archive_path: Path) -> Dict[str, Any]:
    """Verify archive integrity, manifest, member security, and database readability."""
    if not archive_path.exists():
        raise FileNotFoundError(f"Backup archive not found: {archive_path}")

    dummy_dest = Path("/nonexistent/security_check")
    with tarfile.open(archive_path, "r:gz") as tar:
        # Pre-validate all member names, types, and structure against security rules
        for member in tar.getmembers():
            validate_archive_member(member, dummy_dest)

        members = tar.getnames()
        if "manifest.json" not in members:
            raise ValueError("Invalid backup archive: manifest.json missing.")

        manifest_file = tar.extractfile("manifest.json")
        if not manifest_file:
            raise ValueError("Could not read manifest.json from archive.")
        try:
            manifest = json.loads(manifest_file.read().decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"Corrupt or invalid manifest.json: {exc}") from exc

        if not isinstance(manifest, dict) or "components" not in manifest:
            raise ValueError("Corrupt manifest.json: missing 'components' dictionary.")

        if "metadata.db" in members:
            db_file = tar.extractfile("metadata.db")
            if db_file:
                content = db_file.read()
                actual_hash = hashlib.sha256(content).hexdigest()
                expected_hash = manifest.get("components", {}).get("database", {}).get("sha256")
                if not expected_hash:
                    raise ValueError("Manifest missing required 'sha256' for database component.")
                if actual_hash != expected_hash:
                    raise ValueError(f"Database SHA256 mismatch! Expected {expected_hash}, got {actual_hash}")

    print(f"Backup archive {archive_path.name} verified successfully.")
    return manifest


def restore_backup(
    archive_path: Path,
    target_base_dir: Path,
    db_rel_path: str = "data/metadata.db",
    force: bool = False,
) -> None:
    """Restore database and storage artifacts from a verified backup archive."""
    manifest = verify_backup(archive_path)

    temp_extract = (target_base_dir / f".temp_restore_{os.getpid()}_{int(datetime.datetime.now().timestamp())}").resolve()
    temp_extract.mkdir(parents=True, exist_ok=True)

    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            validated_members = validate_archive_members(tar, temp_extract)
            for member in validated_members:
                tar.extract(member, path=temp_extract)

        # Restore database
        if (temp_extract / "metadata.db").exists():
            dest_db = (target_base_dir / db_rel_path).resolve()
            dest_db.parent.mkdir(parents=True, exist_ok=True)
            if dest_db.exists():
                backup_pre_restore = dest_db.with_suffix(".pre_restore.db")
                shutil.copy2(dest_db, backup_pre_restore)
                print(f"Saved pre-restore safety copy: {backup_pre_restore}")
            shutil.copy2(temp_extract / "metadata.db", dest_db)
            print(f"Restored database to: {dest_db}")

        # Restore uploads
        if (temp_extract / "uploads").exists():
            dest_uploads = (target_base_dir / "uploads").resolve()
            shutil.copytree(temp_extract / "uploads", dest_uploads, dirs_exist_ok=True)
            print(f"Restored uploads to: {dest_uploads}")

        # Restore experiments
        if (temp_extract / "experiments").exists():
            dest_experiments = (target_base_dir / "experiments").resolve()
            shutil.copytree(temp_extract / "experiments", dest_experiments, dirs_exist_ok=True)
            print(f"Restored experiments to: {dest_experiments}")

        print("Restore completed successfully.")

    finally:
        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="AutoNexa Backup and Recovery Utility")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup", help="Create a timestamped backup archive")
    backup_parser.add_argument("--base-dir", default=".", help="Application base directory")
    backup_parser.add_argument("--output-dir", default="backups", help="Destination folder for archives")

    verify_parser = subparsers.add_parser("verify", help="Verify integrity of an existing backup archive")
    verify_parser.add_argument("--archive", required=True, help="Path to backup tar.gz archive")

    restore_parser = subparsers.add_parser("restore", help="Restore state from backup archive")
    restore_parser.add_argument("--archive", required=True, help="Path to backup tar.gz archive")
    restore_parser.add_argument("--target-base-dir", default=".", help="Target base directory")

    args = parser.parse_args()

    if args.command == "backup":
        create_backup(Path(args.base_dir), Path(args.output_dir))
    elif args.command == "verify":
        verify_backup(Path(args.archive))
    elif args.command == "restore":
        restore_backup(Path(args.archive), Path(args.target_base_dir))


if __name__ == "__main__":
    main()
