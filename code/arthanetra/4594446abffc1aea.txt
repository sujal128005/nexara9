import os

os.environ["ARTHANETRA_PROVIDER"] = "offline"

from fastapi.testclient import TestClient  # noqa: E402

from app.llm import reset_gateway  # noqa: E402
from app.main import app  # noqa: E402

reset_gateway()
client = TestClient(app)


def test_health():
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["engine"]["provider"] == "offline"


def test_samples_and_analyze_and_simulate():
    samples = client.get("/api/samples").json()
    assert len(samples) == 7
    text = client.get(f"/api/samples/{samples[0]['id']}").json()["text"]
    r = client.post("/api/analyze", data={"text": text, "language": "hi"}).json()
    assert r["score"]["score"] >= 75
    m = dict(r["model"])
    m["fees"] = []
    m["disbursed"] = None
    s = client.post("/api/simulate", json={"model": m, "facts": r["facts"], "document_text": text}).json()
    assert s["computed"]["apr"] < r["computed"]["apr"]


def test_rejects_empty():
    assert client.post("/api/analyze", data={"text": "hi"}).status_code == 400


def test_sample_path_traversal_blocked():
    assert client.get("/api/samples/..%2F..%2Fapp%2Fmain").status_code == 404


def test_upload_text_file():
    r = client.post("/api/analyze", files={"file": ("offer.txt", b"Loan amount: Rs 10,000\nTenure: 30 days\nInterest rate: 2% per month\nProcessing fee: Rs 500 deducted")})
    assert r.status_code == 200 and r.json()["computed"]["apr"] > 0.24
