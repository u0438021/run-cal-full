import json

import httpx
import pytest

from app.insights import (
    build_evidence,
    evidence_fingerprint,
    generate_insight,
    validate_insight,
)


def analytics():
    return {
        "metricVersion": "firebase-analytics-v1",
        "parserVersion": "0.3.0",
        "sourceSha256": "secret-source",
        "seriesObjectKey": "private/path",
        "activity": {
            "metrics": {
                "power_w": {"value": 250, "unit": "W", "coverage": 0.96, "confidence": "high"},
                "air_power_w": {
                    "value": None,
                    "unit": "W",
                    "coverage": 0,
                    "confidence": "unavailable",
                },
            }
        },
        "power": {
            "watts_per_kg": {"value": 3.5, "unit": "W/kg", "coverage": 0.96, "confidence": "high"}
        },
        "efficiency": {
            "power_per_heartbeat": {
                "available": True,
                "first_half": 1.7,
                "second_half": 1.6,
                "unit": "W/bpm",
                "drift_pct": 5.88,
                "paired_seconds": 1200,
            }
        },
        "powerDuration": [{"seconds": 60, "watts": 300}, {"seconds": 1200, "watts": None}],
    }


def insight(evidence_id="activity.power_w", observation="กำลังเฉลี่ยอยู่ที่ 250 วัตต์"):
    return {
        "headline": "สรุปการวิ่ง",
        "observation": observation,
        "evidence": [{"id": evidence_id, "statement": "กำลังเฉลี่ย 250 W"}],
        "confidence": "high",
        "caveat": "พิจารณาร่วมกับความรู้สึกหลังวิ่ง",
        "action": None,
    }


def test_evidence_pack_contains_only_supported_aggregates():
    result = build_evidence(analytics())
    assert set(result["items"]) == {
        "activity.power_w",
        "power.watts_per_kg",
        "efficiency.power_per_heartbeat",
        "power_duration.60s",
    }
    encoded = json.dumps(result)
    assert "secret-source" not in encoded
    assert "private/path" not in encoded


def test_validator_requires_real_evidence_and_blocks_medical_claims():
    evidence = build_evidence(analytics())
    assert validate_insight(insight(), evidence)["confidence"] == "high"
    with pytest.raises(ValueError, match="unknown evidence"):
        validate_insight(insight("made.up"), evidence)
    with pytest.raises(ValueError, match="medical language"):
        validate_insight(insight(observation="มีความเสี่ยงบาดเจ็บ"), evidence)


def test_responses_request_is_structured_not_stored_and_validated():
    evidence = build_evidence(analytics())

    def handler(request):
        body = json.loads(request.content)
        assert body["store"] is False
        assert body["text"]["format"]["type"] == "json_schema"
        assert body["safety_identifier"] == "hashed-user"
        assert "private/path" not in body["input"]
        return httpx.Response(
            200,
            json={
                "id": "resp_test",
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(insight(), ensure_ascii=False),
                            }
                        ]
                    }
                ],
            },
        )

    result, response_id = generate_insight(
        evidence, "test-key", "test-model", "hashed-user", httpx.MockTransport(handler)
    )
    assert result["headline"] == "สรุปการวิ่ง"
    assert response_id == "resp_test"


def test_evidence_fingerprint_is_stable():
    evidence = build_evidence(analytics())
    assert evidence_fingerprint(evidence) == evidence_fingerprint(
        dict(reversed(list(evidence.items())))
    )
