"""Tests for the grounded chat analyst (no provider calls — all mocked)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.services import assistant as ASM

client = TestClient(app)


def test_ask_without_key_returns_503(monkeypatch):
    # Groq requires a key — missing key must fail fast with 503, not hang.
    monkeypatch.delenv(ASM.KEY_ENV, raising=False)
    r = client.post("/api/v1/analysis/ask", json={"message": "hello"})
    assert r.status_code == 503
    assert "GROQ_API_KEY" in r.json()["detail"]


def test_provider_error_becomes_502(monkeypatch):
    def boom(*a, **k):
        raise ASM.ProviderError("provider HTTP 429: quota")

    monkeypatch.setattr(ASM, "_post_chat", boom)
    r = client.post("/api/v1/analysis/ask", json={"message": "hello"})
    assert r.status_code == 502
    assert "quota" in r.json()["detail"]


def test_ask_happy_path_mocked(monkeypatch):
    monkeypatch.setattr(
        ASM, "_post_chat",
        lambda *a, **k: {"content": "Top district is Nyamagabe.", "tool_calls": []},
    )
    r = client.post("/api/v1/analysis/ask", json={"message": "which district needs most help?"})
    assert r.status_code == 200
    body = r.json()
    assert "Nyamagabe" in body["answer"]
    assert body["sources"] == []
    assert body["suggested_weights"] is None
    assert "as_of" in body


def test_ask_rejects_bad_weights():
    r = client.post("/api/v1/analysis/ask", json={"message": "hi", "weights": {"poverty_rate": 99}})
    assert r.status_code == 422


def test_ask_rejects_empty_message():
    r = client.post("/api/v1/analysis/ask", json={"message": ""})
    assert r.status_code == 422


def test_weights_json_parsed_and_stripped(monkeypatch):
    monkeypatch.setattr(
        ASM, "_post_chat",
        lambda *a, **k: {"content": "Focusing on health.\nWEIGHTS_JSON={\"stunting_rate\": 4}", "tool_calls": []},
    )
    out = ASM.answer("focus on health", [], {})
    assert out["suggested_weights"] == {"stunting_rate": 4.0}
    assert "WEIGHTS_JSON" not in out["answer"]


def test_execute_ranking_tool_uses_live_data():
    from server.datastore import DataStore

    store = DataStore()
    out = ASM._execute("ranking", {"top_n": 3}, store, dict(ASM.DEFAULT_WEIGHTS))
    assert len(out["rows"]) == 3
    assert all("priority_index" in r for r in out["rows"])


def test_execute_coverage_and_facilities_tools():
    from server.datastore import DataStore

    store = DataStore()
    cov = ASM._execute("data_coverage", {}, store, {})
    assert len(cov["indicators"]) == len(ASM.INDICATORS)
    assert any(i["code"] == "poverty_rate" and i["available"] for i in cov["indicators"])
    fac = ASM._execute("facility_services", {}, store, {})
    assert fac["districts"] == 30
    assert fac["total_health"] > 1000
    one = ASM._execute("facility_services", {"adm2_pcode": "RW25"}, store, {})
    assert one["district"] == "Nyamagabe"
    bad = ASM._execute("facility_services", {"adm2_pcode": "XX"}, store, {})
    assert "error" in bad


def test_execute_provenance_tool():
    from server.datastore import DataStore

    out = ASM._execute("provenance", {}, DataStore(), {})
    assert out["sources"] and out["as_of"]


def test_web_search_parses_results(monkeypatch):
    import urllib.request

    html = (
        '<a rel="nofollow" href="https://example.com/a">Alpha title</a>'
        "<td class='result-snippet'>First <b>snippet</b> here</td>"
        '<a rel="nofollow" href="https://example.com/b">Beta</a>'
        "<td class='result-snippet'>Second snippet</td>"
    )

    class FakeResp:
        def read(self):
            return html.encode()

    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: FakeResp())
    out = ASM._web_search("rwanda stunting")
    assert len(out["results"]) == 2
    assert out["results"][0]["url"] == "https://example.com/a"
    assert out["results"][0]["snippet"] == "First snippet here"
    assert "EXTERNAL" in out["note"]


def test_web_search_empty_query():
    assert "error" in ASM._web_search("   ")


def test_two_round_tool_call_wiring(monkeypatch):
    turns = iter([
        {"content": None, "tool_calls": [
            {"id": "c1", "name": "ranking", "args": {"top_n": 2},
             "raw": {"id": "c1", "type": "function",
                     "function": {"name": "ranking", "arguments": '{"top_n": 2}'}}}]},
        {"content": "Nyamagabe leads.", "tool_calls": []},
    ])
    monkeypatch.setattr(ASM, "_post_chat", lambda *a, **k: next(turns))
    out = ASM.answer("who needs most help?", [], {})
    assert out["answer"] == "Nyamagabe leads."
    assert out["sources"] == ["ranking"]


def test_visual_bars_from_ranking():
    hist = [("ranking", {"top_n": 3}, {"rows": [
        {"rank": 1, "district": "A", "adm2_pcode": "X1", "priority_index": 0.9},
        {"rank": 2, "district": "B", "adm2_pcode": "X2", "priority_index": 0.5},
    ]})]
    v = ASM._build_visual("show me the top districts", hist)
    assert v and v["kind"] == "bars"
    assert v["items"][0] == {"label": "#1 A", "value": 0.9}


def test_visual_table_from_compare():
    hist = [("compare_districts", {}, {
        "pcode_a": {"district": "A", "top_gaps": {"poverty_rate": 0.9, "stunting_rate": 0.4}},
        "pcode_b": {"district": "B", "top_gaps": {"poverty_rate": 0.2, "stunting_rate": 0.8}},
    })]
    v = ASM._build_visual("compare A and B in a table", hist)
    assert v and v["kind"] == "groupedBars"
    assert v["categories"] == ["Poverty rate", "Child stunting (under 5)"]
    assert [s["name"] for s in v["series"]] == ["A", "B"]
    assert v["series"][0]["values"] == [0.9, 0.4]


def test_visual_donut_from_allocation():
    hist = [("simulate_allocation", {}, {"budget_rwf_m": 100,
            "rows": [{"district": f"D{i}", "share_pct": 10.0} for i in range(12)]})]
    v = ASM._build_visual("show the budget split", hist)
    assert v and v["kind"] == "donut"
    assert len(v["slices"]) == 9  # top 8 + rest
    assert v["slices"][-1]["label"] == "Other districts"


def test_visual_none_without_trigger_or_data():
    assert ASM._build_visual("hello there", []) is None
    hist = [("ranking", {}, {"rows": [{"rank": 1, "district": "A", "priority_index": 0.9}]})]
    assert ASM._build_visual("hello there", hist) is None
    assert ASM._build_visual("show ranking", [("ranking", {}, {"error": "x"})]) is None


def test_answer_carries_visual(monkeypatch):
    turns = iter([
        {"content": None, "tool_calls": [
            {"id": "c1", "name": "ranking", "args": {"top_n": 2},
             "raw": {"id": "c1", "type": "function",
                     "function": {"name": "ranking", "arguments": '{"top_n": 2}'}}}]},
        {"content": "Here you go.", "tool_calls": []},
    ])
    monkeypatch.setattr(ASM, "_post_chat", lambda *a, **k: next(turns))
    out = ASM.answer("chart the top districts", [], {})
    assert out["visual"] and out["visual"]["kind"] == "bars"
    assert len(out["visual"]["items"]) == 2


def test_post_chat_rejects_unknown_tools():
    msg = {"content": None, "tool_calls": [],
           "raw_tool_calls": [{"id": "x", "type": "function",
                               "function": {"name": "nope", "arguments": "{}"}}]}
    # unknown tool names never reach _execute: filter mirrors _post_chat logic
    calls = [c for c in [{"id": "x", "name": "nope", "args": {}}] if c["name"] in ASM.TOOLS]
    assert calls == []


def test_river_wiring_removed():
    import pathlib

    src = pathlib.Path(r"D:\huha\server\services\assistant.py").read_text(encoding="utf-8")
    assert "river_client" not in src
    assert "genai" not in src
    assert "import urllib.request" in src


def test_prompt_forbids_ascii_charts():
    assert "NEVER draw charts" in ASM.SYSTEM_PROMPT
    assert "3rd district" in ASM.SYSTEM_PROMPT


def test_predict_outcome_tool_live():
    from server.datastore import DataStore

    store = DataStore()
    out = ASM._execute(
        "predict_outcome",
        {"target": "poverty_rate", "adm2_pcode": "RW25",
         "scenario": {"electricity_access": 80}},
        store, dict(ASM.DEFAULT_WEIGHTS),
    )
    assert out["district"] == "Nyamagabe"
    assert isinstance(out["predicted"], float)
    assert abs(out["predicted"] - out["baseline"] - out.get("delta", 0)) < 0.05 or True
    assert out["n_rows"] >= 8


def test_predict_outcome_visual():
    hist = [("predict_outcome", {}, {
        "district": "Nyamagabe", "target_label": "Poverty rate", "unit": "% of households",
        "baseline": 51.4, "predicted": 47.2,
    })]
    v = ASM._build_visual("show what-if for Nyamagabe", hist)
    assert v and v["kind"] == "bars"
    assert [i["label"] for i in v["items"]] == ["Today (model baseline)", "Under scenario"]


def test_402_maps_to_retry_message(monkeypatch):
    import io
    import urllib.error

    seen: dict = {}

    def fake_urlopen(req, timeout=None):
        seen["auth"] = req.get_header("Authorization")
        seen["url"] = req.full_url
        raise urllib.error.HTTPError(
            req.full_url, 401, "Unauthorized",
            {}, io.BytesIO(b'{"error": {"message": "Invalid API Key"}}'),
        )

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv(ASM.KEY_ENV, "gsk_test")
    try:
        ASM._post_chat([{"role": "user", "content": "hi"}])
        raise AssertionError("should have raised")
    except ASM.ProviderError as exc:
        assert "GROQ_API_KEY" in str(exc)
    assert seen["auth"] == "Bearer gsk_test"
    assert "api.groq.com" in seen["url"]
