"""Grounded AI insight contracts; receives aggregates only."""

from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import Any

import httpx

PROMPT_VERSION = "running-insight-v1"
FORBIDDEN = re.compile(
    r"\b(diagnos(?:e|is|tic)|disease|medical|injury|treatment|prescri(?:be|ption))\b|"
    r"บาดเจ็บ|วินิจฉัย|โรค|รักษา|สั่งยา",
    re.IGNORECASE,
)
INSIGHT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "observation", "evidence", "confidence", "caveat", "action"],
    "properties": {
        "headline": {"type": "string", "maxLength": 120},
        "observation": {"type": "string", "maxLength": 600},
        "evidence": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "statement"],
                "properties": {
                    "id": {"type": "string"},
                    "statement": {"type": "string", "maxLength": 240},
                },
            },
        },
        "confidence": {"type": "string", "enum": ["low", "moderate", "high"]},
        "caveat": {"type": "string", "maxLength": 300},
        "action": {"type": ["string", "null"], "maxLength": 300},
    },
}


def build_evidence(analytics: dict[str, Any]) -> dict[str, Any]:
    evidence: dict[str, Any] = {}
    metrics = analytics.get("activity", {}).get("metrics", {})
    for key, metric in metrics.items():
        if isinstance(metric, dict) and metric.get("value") is not None:
            evidence[f"activity.{key}"] = {
                name: metric.get(name) for name in ("value", "unit", "coverage", "confidence")
            }
    watts_per_kg = analytics.get("power", {}).get("watts_per_kg", {})
    if isinstance(watts_per_kg, dict) and watts_per_kg.get("value") is not None:
        evidence["power.watts_per_kg"] = {
            name: watts_per_kg.get(name) for name in ("value", "unit", "coverage", "confidence")
        }
    for key in ("speed_per_heartbeat", "power_per_heartbeat"):
        metric = analytics.get("efficiency", {}).get(key, {})
        if isinstance(metric, dict) and metric.get("available"):
            evidence[f"efficiency.{key}"] = {
                name: metric.get(name)
                for name in ("first_half", "second_half", "unit", "drift_pct", "paired_seconds")
            }
    for point in analytics.get("powerDuration", []):
        if isinstance(point, dict) and point.get("watts") is not None:
            evidence[f"power_duration.{point.get('seconds')}s"] = {
                "seconds": point.get("seconds"),
                "watts": point.get("watts"),
            }
    return {
        "metric_version": analytics.get("metricVersion"),
        "parser_version": analytics.get("parserVersion"),
        "items": evidence,
    }


def validate_insight(content: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(content, dict) or set(content) != set(INSIGHT_SCHEMA["required"]):
        raise ValueError("Insight response has an invalid shape")
    limits = {"headline": 120, "observation": 600, "caveat": 300}
    for key, limit in limits.items():
        if (
            not isinstance(content[key], str)
            or not content[key].strip()
            or len(content[key]) > limit
        ):
            raise ValueError(f"Insight {key} is invalid")
    action = content["action"]
    if action is not None and (not isinstance(action, str) or len(action) > 300):
        raise ValueError("Insight action is invalid")
    if content["confidence"] not in {"low", "moderate", "high"}:
        raise ValueError("Insight confidence is invalid")
    references = content["evidence"]
    if not isinstance(references, list) or not 1 <= len(references) <= 5:
        raise ValueError("Insight evidence is invalid")
    allowed = evidence.get("items", {})
    for reference in references:
        if not isinstance(reference, dict) or set(reference) != {"id", "statement"}:
            raise ValueError("Insight evidence reference is invalid")
        if reference["id"] not in allowed:
            raise ValueError("Insight cites unknown evidence")
        if (
            not isinstance(reference["statement"], str)
            or not reference["statement"].strip()
            or len(reference["statement"]) > 240
        ):
            raise ValueError("Insight evidence statement is invalid")
    rendered = json.dumps(content, ensure_ascii=False)
    if FORBIDDEN.search(rendered):
        raise ValueError("Insight contains prohibited medical language")
    return content


def evidence_fingerprint(evidence: dict[str, Any]) -> str:
    return sha256(json.dumps(evidence, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def generate_insight(
    evidence: dict[str, Any],
    api_key: str,
    model: str,
    safety_identifier: str | None = None,
    transport=None,
) -> tuple[dict[str, Any], str]:
    if not evidence.get("items"):
        raise ValueError("No sufficient analytics evidence")
    request = {
        "model": model,
        "store": False,
        "instructions": (
            "You write one concise Thai running observation. Use only supplied evidence. "
            "Do not diagnose, predict injury, prescribe treatment, or imply causation. "
            "Every numerical claim must cite its exact evidence id."
        ),
        "input": json.dumps(evidence, ensure_ascii=False, separators=(",", ":")),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "running_insight",
                "strict": True,
                "schema": INSIGHT_SCHEMA,
            }
        },
        "max_output_tokens": 700,
    }
    if safety_identifier:
        request["safety_identifier"] = safety_identifier
    with httpx.Client(timeout=30, transport=transport) as client:
        response = client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request,
        )
    if response.status_code >= 400:
        raise RuntimeError("AI provider request failed")
    payload = response.json()
    output_text = payload.get("output_text")
    if not isinstance(output_text, str):
        for item in payload.get("output", []):
            for content in item.get("content", []) if isinstance(item, dict) else []:
                if content.get("type") == "output_text":
                    output_text = content.get("text")
                    break
    if not isinstance(output_text, str):
        raise TypeError("AI provider returned no structured output")
    try:
        parsed = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI provider returned invalid structured output") from exc
    return validate_insight(parsed, evidence), str(payload.get("id") or "")
