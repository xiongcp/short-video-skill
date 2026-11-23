"""对片长边界、错连引用和审批绕过做离线回归。"""
import unittest

from check_design import ROOT, check_duration, check_example, check_graph, load_example, read_schemas, read_yaml, validate_contract


class DesignChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schemas, cls.registry = read_schemas()
        cls.config = read_yaml(ROOT / "profiles/duration.yaml")

    def test_duration_boundaries(self):
        for name, valid, invalid in [
            ("short", [60, 120, 180], [59, 181]),
            ("standard8", [450, 480, 510], [449, 511]),
        ]:
            for seconds in valid:
                with self.subTest(name=name, seconds=seconds):
                    check_duration({"duration_profile": name, "duration_target_seconds": seconds}, self.config["profiles"])
            for seconds in invalid:
                with self.subTest(name=name, seconds=seconds), self.assertRaisesRegex(ValueError, "片长"):
                    check_duration({"duration_profile": name, "duration_target_seconds": seconds}, self.config["profiles"])

    def check_broken(self, mutate, message, example="topic-cache-speed"):
        docs = load_example(ROOT / "examples" / example)
        mutate(docs)
        with self.assertRaisesRegex(ValueError, message):
            check_example(docs, self.schemas, self.registry, self.config)

    def test_cross_chapter_frame_gap(self):
        self.check_broken(lambda d: d["storyboard"]["chapters"][4]["frame_range"].update(start=8101),
                          "空洞", "topic-kafka-to-doris")

    def test_wrong_voice_anchor(self):
        self.check_broken(lambda d: d["storyboard"]["shots"][0].update(audio_anchors=["missing"]), "锚点")

    def test_unsupported_gesture(self):
        self.check_broken(lambda d: d["storyboard"]["shots"][0]["character_actions"][0].update(gesture="jump"), "角色能力")

    def test_visual_cue_outside_shot(self):
        self.check_broken(lambda d: d["storyboard"]["shots"][3]["visual_cues"][0].update(at_local_frame=240), "出界")

    def test_missing_evidence(self):
        self.check_broken(lambda d: d["evidence-set"]["claim_source_links"].clear(), "缺支持来源")

    def test_missing_layer(self):
        self.check_broken(lambda d: d["storyboard"]["shots"][0].update(scene_layers=["asset://cache-speed/lost/v1"]), "图层")

    def test_quality_gate_bypass(self):
        graph = read_yaml(ROOT / "workflows/topic-to-video.yaml")
        graph["transitions"].append({"from": "EXPORT_REVIEW", "to": "DELIVERED", "mode": "quality"})
        with self.assertRaisesRegex(ValueError, "审批路径"):
            check_graph(graph, ("G1", "G2", "G3", "G4", "G5"), "quality")

    def test_draft_cannot_reach_delivery(self):
        graph = read_yaml(ROOT / "workflows/topic-to-video.yaml")
        graph["transitions"].append({"from": "DRAFT_READY", "to": "DELIVERED", "mode": "draft"})
        with self.assertRaisesRegex(ValueError, "意外终点"):
            check_graph(graph, ("G1", "G2", "G3", "G4", "G5"), "draft")

    def test_unknown_paid_job_cannot_retry(self):
        result = {"status":"unknown", "job_id":"job_one", "artifact_refs":[], "warnings":[],
                  "cost":{"currency":"USD", "estimated_minor":100, "actual_minor":None},
                  "retryable":False, "next_action":"reconcile"}
        validate_contract(result, "workflow#ToolResult", self.schemas, self.registry)
        for change in ({"retryable": True}, {"next_action": "retry"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_contract({**result, **change}, "workflow#ToolResult", self.schemas, self.registry)

    def test_video_candidate_count_must_be_positive(self):
        payload = {"shot_id": "shot_one", "reference_refs": ["asset://episode/rig/v1"], "target_frames": 150, "candidate_count": 0}
        with self.assertRaisesRegex(ValueError, "candidate_count"):
            validate_contract(payload, "workflow#GenerateVideoInput", self.schemas, self.registry)


if __name__ == "__main__":
    unittest.main()
