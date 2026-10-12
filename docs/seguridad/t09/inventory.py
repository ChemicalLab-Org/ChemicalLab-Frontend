"""T09 inventory adapters. No network, installation, database or application execution.

Usage: python inventory.py plugins resolved-plugins.txt plugins.cdx.json
       python inventory.py jar application.jar packaged.cdx.json resolved.cdx.json [packaging-inputs.cdx.json]
       python inventory.py npm-lock package-lock.json locked.cdx.json
       python inventory.py bundle dist/project/stats.json bundled.cdx.json
"""
import hashlib
import base64
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import quote


def component(group, name, version, digest=None):
    purl = f"pkg:maven/{quote(group)}/{quote(name)}@{quote(version)}"
    item = {"type": "library", "group": group, "name": name, "version": version,
            "purl": purl, "bom-ref": purl}
    if digest:
        item["hashes"] = [{"alg": "SHA-256", "content": digest}]
    return item


def plugins(path):
    items, edges, current = {}, {}, None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(r"(\s+)([^\s:]+):([^\s:]+):jar:(?:[^\s:]+:)?([^\s:]+)\s*", line)
        if not match:
            continue
        item = component(*match.groups()[1:])
        ref = item["bom-ref"]
        items[ref] = item
        if len(match[1]) == 3:
            current = ref
            edges.setdefault(current, set())
        elif current and current != ref:
            edges[current].add(ref)
    if not edges:
        raise ValueError("No plugin roots in resolve-plugins output")
    return items, edges


def jar(path, resolved=None):
    items = {}
    with zipfile.ZipFile(path) as outer:
        for name in outer.namelist():
            if not name.startswith("BOOT-INF/lib/") or not name.endswith(".jar"):
                continue
            data = outer.read(name)
            with zipfile.ZipFile(io.BytesIO(data)) as inner:
                candidates = [x for x in inner.namelist() if re.match(r"META-INF/maven/[^/]+/[^/]+/pom.properties$", x)]
                # Shaded JARs may expose several embedded metadata files; select its own artifact.
                values = []
                for candidate in candidates:
                    props = dict(re.findall(r"^([^#!\s=]+)=(.*)$", inner.read(candidate).decode("utf-8").replace("\r", ""), re.M))
                    if all(k in props for k in ("groupId", "artifactId", "version")):
                        values.append(props)
                own = [p for p in values if Path(name).name == f"{p['artifactId']}-{p['version']}.jar"]
                reconciled = [c for c in (resolved or {}).get("components", []) if Path(name).name == f"{c['name']}-{c.get('version')}.jar"]
                if len(own) != 1 and len(reconciled) == 1:
                    c = reconciled[0]
                    digest = hashlib.sha256(data).hexdigest()
                    expected = [h["content"] for h in c.get("hashes", []) if h["alg"] == "SHA-256"]
                    if expected and digest not in expected:
                        raise ValueError("Packaged bytes differ from supplied resolved artifact: " + Path(name).name)
                    item = component(c["group"], c["name"], c["version"], digest)
                    items[item["bom-ref"]] = item
                elif len(own) != 1:
                    # Spring/Jackson publications may omit Maven metadata. Explicit fallback
                    # records unresolved identity rather than inventing group coordinates.
                    key = Path(name).name
                    items[key] = {"type": "library", "name": key, "bom-ref": key,
                                  "hashes": [{"alg": "SHA-256", "content": hashlib.sha256(data).hexdigest()}],
                                  "properties": [{"name": "t09:coordinate", "value": "unresolved; reconcile with resolved Maven SBOM"}]}
                else:
                    p = own[0]
                    item = component(p["groupId"], p["artifactId"], p["version"], hashlib.sha256(data).hexdigest())
                    items[item["bom-ref"]] = item
    return items, {}


def npm_component(key, entry):
    name = entry.get("name") or key.rsplit("node_modules/", 1)[-1]
    ref = "pkg:npm/" + quote(name, safe="/") + "@" + entry["version"]
    item = {"type": "library", "name": name, "version": entry["version"], "purl": ref,
            "bom-ref": ref + "#" + key,
            "properties": [{"name": "t09:lock-path", "value": key},
                           {"name": "t09:dev", "value": str(entry.get("dev", False)).lower()},
                           {"name": "t09:optional", "value": str(entry.get("optional", False)).lower()}]}
    integrity = entry.get("integrity", "").split()
    if integrity and integrity[0].startswith("sha512-"):
        item["hashes"] = [{"alg": "SHA-512", "content": base64.b64decode(integrity[0][7:]).hex()}]
    return item


def npm_lock(path):
    lock = json.loads(path.read_text(encoding="utf-8-sig"))
    items = {key: npm_component(key, entry) for key, entry in lock["packages"].items() if key and "version" in entry}
    edges = {}
    for key, item in items.items():
        refs = set()
        for dependency in lock["packages"][key].get("dependencies", {}):
            parent = key
            while True:
                target = f"{parent}/node_modules/{dependency}" if parent else f"node_modules/{dependency}"
                if target in items:
                    refs.add(items[target]["bom-ref"])
                    break
                if not parent:
                    raise ValueError(f"Unresolved locked edge: {key} -> {dependency}")
                parent = parent.rsplit("/node_modules/", 1)[0] if "/node_modules/" in parent else ""
        edges[item["bom-ref"]] = refs
    return {item["bom-ref"]: item for item in items.values()}, edges


def bundle(path):
    project = next(p for p in path.resolve().parents if (p / "package-lock.json").exists())
    lock = json.loads((project / "package-lock.json").read_text(encoding="utf-8-sig"))["packages"]
    stats = json.loads(path.read_text(encoding="utf-8-sig"))
    bytes_by_key = {}
    for output in stats["outputs"].values():
        for source, value in output.get("inputs", {}).items():
            if value.get("bytesInOutput", 0) <= 0 or "node_modules/" not in source.replace("\\", "/"):
                continue
            source = source.replace("\\", "/")
            candidates = [key for key in lock if key and (source.startswith(key + "/") or source == key)]
            if not candidates:
                raise ValueError(f"Bundled input absent from lock: {source}")
            key = max(candidates, key=len)
            bytes_by_key[key] = bytes_by_key.get(key, 0) + value["bytesInOutput"]
    items = {}
    for key, size in bytes_by_key.items():
        item = npm_component(key, lock[key])
        item["properties"].append({"name": "t09:bytes-emitted", "value": str(size)})
        items[item["bom-ref"]] = item
    return items, {}


def main():
    mode, source, destination, *extra = sys.argv[1:]
    if mode == "jar":
        resolved = {"components": [c for source in extra
                    for c in json.loads(Path(source).read_text(encoding="utf-8-sig"))["components"]]} if extra else None
        items, edges = jar(Path(source), resolved)
    else:
        items, edges = {"plugins": plugins, "npm-lock": npm_lock, "bundle": bundle}[mode](Path(source))
    output = {"bomFormat": "CycloneDX", "specVersion": "1.6", "version": 1,
              "metadata": {"tools": {"components": [{"type": "application", "name": "T09 inventory adapter", "version": "1"}]}},
              "components": sorted(items.values(), key=lambda x: x["bom-ref"])}
    if edges:
        output["dependencies"] = [{"ref": key, "dependsOn": sorted(value)} for key, value in sorted(edges.items())]
    Path(destination).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{mode}: {len(items)} components; {len(edges)} dependency nodes")


if __name__ == "__main__":
    main()
