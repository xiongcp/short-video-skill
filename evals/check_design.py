"""离线校验架构和分镜示例，或逐帧检查指定的交付媒体。运行方式见项目 README。"""
import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_CONTRACTS = {
    "brief": "topic-brief",
    "evidence-set": "evidence-set",
    "script": "script",
    "assets": "workflow#AssetCatalog",
    "storyboard": "storyboard",
}


def read_yaml(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def indexed(rows, field):
    result = {}
    for row in rows:
        key = row[field]
        require(key not in result, f"重复的 {field}={key}")
        result[key] = row
    return result


def read_schemas():
    schemas = {}
    for path in (ROOT / "schemas").glob("*.schema.json"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(doc)
        schemas[path.name] = doc
    registry = Registry().with_resources(
        (s["$id"], Resource.from_contents(s)) for s in schemas.values()
    )
    def references(node):
        if isinstance(node, dict):
            if "$ref" in node:
                yield node["$ref"]
            for value in node.values():
                yield from references(value)
        elif isinstance(node, list):
            for value in node:
                yield from references(value)
    for doc in schemas.values():
        resolver = registry.resolver(doc["$id"])
        for pointer in references(doc):
            resolver.lookup(pointer)
    return schemas, registry


def validate_contract(document, name, schemas, registry):
    file, _, part = name.partition("#")
    uri = schemas[file + ".schema.json"]["$id"]
    if part:
        uri += "#/$defs/" + part
    validator = Draft202012Validator({"$ref": uri}, registry=registry, format_checker=FormatChecker())
    error = next(validator.iter_errors(document), None)
    if error:
        raise ValueError(f"{name} {error.json_path} — {error.message}")


def check_graph(graph, gates, mode):
    terminal = "DELIVERED" if mode == "quality" else "DRAFT_READY"
    allowed = [row for row in graph["transitions"] if row.get("mode", mode) == mode]
    paths = [(graph["initial"], [], ())]
    reached = set()
    while paths:
        state, visited, approvals = paths.pop()
        require(state not in visited, f"{mode} 正向状态图成环于 {state}")
        outgoing = [row for row in allowed if row["from"] == state]
        if not outgoing:
            require(state == terminal, f"{mode} 意外终点 {state}")
            require(approvals == (gates if mode == "quality" else ()), f"{mode} 审批路径 {approvals}")
            reached.add(state)
        for row in outgoing:
            seen = tuple(x for x in row.get("requires", []) if x in gates)
            paths.append((row["to"], visited + [state], approvals + seen))
    require(terminal in reached, f"{mode} 未到达 {terminal}")


def check_package(schemas):
    reg = read_yaml(ROOT / "registry.yaml")
    perms = read_yaml(ROOT / "policies/permissions.yaml")["skills"]
    budget = read_yaml(ROOT / "policies/budget.yaml")
    gates = tuple(row["id"] for row in read_yaml(ROOT / "policies/approval-gates.yaml")["quality"])
    require(set(reg["skills"]) == set(perms) == {p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md")}, "Skill 注册表与权限表不匹配")
    require(set(reg["adapters"]) == {p.parent.name for p in (ROOT / "tools").glob("*/contract.yaml")}, "适配器注册表不匹配")
    require(reg["entry"] in reg["skills"] and all((ROOT / p).is_file() for p in reg["policies"]), "入口或策略缺失")
    require(set(reg["adapters"]) == {tool for granted in perms.values() for tool in granted}, "权限表引用的适配器不完整")
    def check_pointer(pointer):
        file, _, part = pointer.partition("#/$defs/")
        require(file in schemas and (not part or part in schemas[file].get("$defs", {})), f"契约引用无效 {pointer}")
    for name in reg["skills"]:
        path = ROOT / reg["skill_path"].format(name=name)
        front = yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])
        meta = front["metadata"]
        require(front["name"] == name and meta["budget_class"] in budget["classes"], f"{name} 注册信息不符")
        require(meta["permissions"].endswith("#/skills/" + name) and set(meta["gates"].split()) <= set(gates), f"{name} 策略引用不符")
        pointers = [meta["input_contracts"], meta.get("conditional_input_contracts", ""), meta["output_contracts"]]
        for pointer in " ".join(pointers).split():
            check_pointer(pointer)
    for name in reg["adapters"]:
        contract = read_yaml(ROOT / reg["adapter_path"].format(name=name))
        require(contract["name"] == name and contract["budget_class"] in budget["classes"], f"{name} 合同不符")
        for key in ("request_contract", "payload_contract", "result_contract"):
            check_pointer(contract[key])
    graph = read_yaml(ROOT / reg["workflow"])
    for mode in ("quality", "draft"):
        check_graph(graph, gates, mode)
    return reg


def check_duration(brief, profiles):
    spec = profiles[brief["duration_profile"]]
    require(spec["min_seconds"] <= brief["duration_target_seconds"] <= spec["max_seconds"], "目标片长超出所选档位")


def check_coverage(rows, start, end, label):
    cursor = start
    for item in rows:
        span = item["frame_range"]
        require(cursor == span["start"] < span["end"], f"{label} 在第 {cursor} 帧出现空洞、重叠或空区间")
        cursor = span["end"]
    require(cursor == end, f"{label} 结束帧为 {cursor}，应为 {end}")


def load_example(folder):
    return {name: json.loads((folder / (name + ".json")).read_text(encoding="utf-8")) for name in EXAMPLE_CONTRACTS}


def check_example(docs, schemas, registry, config):
    for name, contract in EXAMPLE_CONTRACTS.items():
        validate_contract(docs[name], contract, schemas, registry)
    brief, evidence, script, assets, board = (docs[n] for n in EXAMPLE_CONTRACTS)
    pid = brief["project_id"]
    require(all(x["project_id"] == pid for x in docs.values()), "项目 ID 不一致")
    require(script["evidence_version"] == evidence["version"] and board["script_version"] == script["version"], "上游版本不匹配")
    check_duration(brief, config["profiles"])
    require(board["timing_basis"] == "planned", "此检查器只接受规划分镜")
    require(all(board["media"][k] == config["media"][k] for k in board["media"]), "媒体规格不匹配")
    require(board["total_frames"] == brief["duration_target_seconds"] * board["media"]["fps"], "总帧数与规划片长不一致")

    claims = indexed(evidence["claims"], "claim_id")
    sources = indexed(evidence["sources"], "source_id")
    supported = set()
    for link in evidence["claim_source_links"]:
        require(link["claim_id"] in claims and link["source_id"] in sources, "论点来源链接悬空")
        if link["relation"] == "supports":
            supported.add(link["claim_id"])
    require(all(k in supported for k, v in claims.items() if v["status"] == "supported"), "supported 论点缺支持来源")
    require(all(set(x["claim_ids"]) <= claims.keys() for x in evidence["conflicts"]), "冲突指向未知论点")

    sections = indexed(script["sections"], "section_id")
    indexed([cue for sec in sections.values() for cue in sec["cues"]], "cue_id")
    for sec in sections.values():
        require(set(sec["claim_ids"]) <= claims.keys(), f"{sec['section_id']} 引用了未知论点")
        require(all(cue["text"] in sec["narration"] for cue in sec["cues"]), f"{sec['section_id']} 的 cue 缺少对应台词")

    registered = indexed(assets["assets"], "ref")
    require(all(r.startswith(f"asset://{pid}/") for r in registered), "出现跨项目资产引用")
    characters = indexed(assets["characters"], "character_ref")
    scenes = indexed(assets["scenes"], "scene_ref")
    def asset_is(ref, kind):
        return ref in registered and registered[ref]["kind"] == kind
    for char in characters.values():
        require(char["project_id"] == pid and asset_is(char["character_ref"], "character") and asset_is(char["rig_ref"], "rig") and asset_is(char["voice_ref"], "voice"), "角色资产引用有误")
    for scene in scenes.values():
        frame = scene["safe_area"]
        require(frame["left"] < frame["right"] and frame["top"] < frame["bottom"], "场景安全区为空")
        require(scene["project_id"] == pid and asset_is(scene["scene_ref"], "scene"), "场景资产未登记")
        require(all(asset_is(l["asset_ref"], l["role"]) for l in scene["layers"]), "场景图层未登记或类型错误")
        require(all(set(layer.get("claim_ids", [])) <= claims.keys() for layer in scene["layers"]), "图解图层引用了未知论点")

    chapters = indexed(board["chapters"], "chapter_id")
    indexed(board["shots"], "shot_id")
    check_coverage(board["chapters"], 0, board["total_frames"], "章节")
    check_coverage(board["shots"], 0, board["total_frames"], "全片镜头")
    membership = [s for ch in chapters.values() for s in ch["section_ids"]]
    require(len(membership) == len(set(membership)) and set(membership) == sections.keys(), "段落与章节分配不完整")
    for ch_id, ch in chapters.items():
        span = ch["frame_range"]
        shots = [x for x in board["shots"] if x["chapter_id"] == ch_id]
        check_coverage(shots, span["start"], span["end"], ch_id)
        require(sum(sections[s]["duration_estimate_frames"] for s in ch["section_ids"]) == span["end"] - span["start"], f"{ch_id} 段落预算未闭合")
    for shot in board["shots"]:
        label = shot["shot_id"]
        chapter = chapters.get(shot["chapter_id"])
        require(chapter and shot["section_id"] in chapter["section_ids"], f"{label} 段落归属有误")
        sec = sections[shot["section_id"]]
        require(set(shot["audio_anchors"]) <= {x["cue_id"] for x in sec["cues"]}, f"{label} 语音锚点悬空")
        scene = scenes.get(shot["scene_ref"])
        require(scene is not None, f"{label} 场景不存在")
        layers = indexed(scene["layers"], "asset_ref")
        require(set(shot["scene_layers"]) <= layers.keys(), f"{label} 图层归属有误")
        for cue in shot["visual_cues"]:
            ref = cue["target_ref"]
            require(ref in shot["scene_layers"] and cue["element_id"] in layers[ref]["element_ids"], f"{label} 图解元素未登记")
            require(cue["at_local_frame"] < shot["frame_range"]["end"] - shot["frame_range"]["start"], f"{label} 图层动画出界")
        for act in shot["character_actions"]:
            char = characters.get(act["character_ref"])
            require(char and act["angle"] in char["supported_angles"] and act["expression"] in char["expressions"] and act["gesture"] in char["gestures"], f"{label} 超出角色能力")
            require(act["gaze"] == "camera" or act["gaze"] in scene["props"], f"{label} 视线指向未知道具")
    return f"{pid} · {len(chapters)} 个章节/段落组 · {len(board['shots'])} 镜 · {board['total_frames']} 帧"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("examples", type=Path, nargs="*", help="包含五份规划 JSON 的示例目录")
    parser.add_argument("--media", type=Path, help="逐帧检查本地交付视频，并输出 JSON 报告")
    parser.add_argument("--profile", help="交付媒体的片长档位")
    parser.add_argument("--target-seconds", type=int, help="要求精确交付的整数秒数")
    args = parser.parse_args()
    if args.media is not None:
        from media_acceptance import inspect_media
        config = read_yaml(ROOT / read_yaml(ROOT / "registry.yaml")["duration_profiles"])
        if args.examples or args.profile not in config["profiles"]:
            parser.error("媒体检查需要选择登记的 --profile，且不能同时传入规划目录")
        bounds = config["profiles"][args.profile]
        if args.target_seconds is not None and not bounds["min_seconds"] <= args.target_seconds <= bounds["max_seconds"]:
            parser.error("精确目标必须位于所选片长档内")
        report = inspect_media(args.media, args.profile, args.target_seconds, config)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return {"PASS": 0, "FAIL": 1, "BLOCKED": 2}[report["status"]]
    if args.profile is not None or args.target_seconds is not None:
        parser.error("片长选项需要配合 --media 使用")
    schemas, registry = read_schemas()
    reg = check_package(schemas)
    config = read_yaml(ROOT / reg["duration_profiles"])
    print(f"{len(reg['skills'])} 个 Skill，{len(reg['adapters'])} 个工具合同，{len(schemas)} 份 Schema，两条审批路径通过")
    for folder in args.examples or sorted((ROOT / "examples").iterdir()):
        print(check_example(load_example(folder), schemas, registry, config))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError) as error:
        print(f"架构校验失败 — {error}", file=sys.stderr)
        sys.exit(1)
