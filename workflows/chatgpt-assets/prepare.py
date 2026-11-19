"""Check an approved episode and package it for import into 即梦."""

import argparse
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile


STAGES = {"script": "剧本", "storyboard": "分镜", "assets": "资产"}
ASSET_KINDS = {"character": "角色", "scene": "场景", "prop": "道具", "continuity": "接缝参考"}
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp"}


def source_file(root, name, extensions):
    path = (root / name).resolve()
    if Path(name).is_absolute() or not path.is_relative_to(root):
        raise ValueError(f"文件必须在制作目录内：{name}")
    if path.suffix.lower() not in extensions or not path.is_file():
        raise ValueError(f"找不到文件或文件类型不符：{name}")
    return path


def checked_id(record, seen):
    value = record["id"]
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError(f"ID 只能用字母、数字、下划线和短横线：{value}")
    if value.casefold() in seen:
        raise ValueError(f"重复 ID：{value}")
    seen.add(value.casefold())
    return value


def prepare(manifest_path, destination):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    root = manifest_path.resolve().parent
    unapproved = [label for key, label in STAGES.items() if manifest["approved"].get(key) is not True]
    if unapproved:
        raise ValueError(f"请先完成审核：{'、'.join(unapproved)}")

    text_types = {".txt", ".md"}
    script = source_file(root, manifest["script"], text_types)
    storyboard = source_file(root, manifest["storyboard"], text_types)
    files = {f"01 剧本{script.suffix}": script, f"02 分镜{storyboard.suffix}": storyboard}
    if any(not path.read_text(encoding="utf-8-sig").strip() for path in files.values()):
        raise ValueError("剧本和分镜需要填写内容")

    assets = {}
    asset_ids = set()
    for asset in manifest["assets"]:
        asset_id = checked_id(asset, asset_ids)
        path = source_file(root, asset["file"], IMAGE_TYPES)
        kind = ASSET_KINDS[asset["kind"]]
        archive_name = f"参考图/{kind}/{asset_id}-{path.name}"
        assets[asset_id] = archive_name, path

    segment_ids = set()
    total_seconds = 0
    instructions = []
    for segment in manifest["segments"]:
        segment_id = checked_id(segment, segment_ids)
        seconds = segment["seconds"]
        if type(seconds) is not int or not 1 <= seconds <= 15:
            raise ValueError(f"第 {segment_id} 段时长须为 1–15 秒的整数")
        refs = segment["references"]
        if not isinstance(refs, list) or not 1 <= len(refs) <= 9 or len(set(refs)) != len(refs):
            raise ValueError(f"第 {segment_id} 段需要 1–9 个不同的参考图 ID")
        if any(ref not in assets for ref in refs):
            raise ValueError(f"第 {segment_id} 段引用了未登记的资产 ID")

        prompt = source_file(root, segment["prompt"], text_types)
        prompt_text = prompt.read_text(encoding="utf-8-sig")
        if not prompt_text.strip():
            raise ValueError(f"第 {segment_id} 段的提示词为空")
        indices = {int(index) for index in re.findall(r"@图片\s*(\d+)", prompt_text)}
        if not indices.issubset(range(1, len(refs) + 1)):
            raise ValueError(f"第 {segment_id} 段的 @图片编号超出参考图顺序")

        prompt_name = f"分段提示词/{segment_id}{prompt.suffix}"
        files[prompt_name] = prompt
        instructions.extend(["", f"第 {segment_id} 段 · {seconds} 秒", f"提示词　{prompt_name}"])
        for index, ref in enumerate(refs, start=1):
            archive_name, path = assets[ref]
            files[archive_name] = path
            instructions.append(f"@图片{index}　{archive_name}")
        total_seconds += seconds

    if not segment_ids:
        raise ValueError("请登记至少一个视频段落")
    header = [
        f"{manifest['title']} · 第 {manifest['episode']} 集 · 共 {total_seconds} 秒",
        "先把定稿参考图加入即梦项目素材库，再按每段的 @图片编号绑定。",
        "粘贴提示词后核对时长和积分报价，再提交视频生成。",
    ]
    if destination.suffix.lower() != ".zip":
        raise ValueError("输出文件名需以 .zip 结尾")
    with TemporaryDirectory(dir=destination.parent) as staging:
        archive = Path(staging) / "episode.zip"
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as package:
            for archive_name, path in files.items():
                package.write(path, archive_name)
            package.writestr("03 即梦导入清单.txt", "\n".join(header + instructions) + "\n")
        destination.hardlink_to(archive)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        prepare(args.manifest, args.output)
    except FileExistsError:
        parser.exit(1, f"输出文件已存在，请更换文件名：{args.output}\n")
    except (AttributeError, KeyError, OSError, TypeError, ValueError) as error:
        parser.exit(1, f"打包失败：{error}\n")
    print(f"已生成导入包：{args.output}")


if __name__ == "__main__":
    main()
