"""The agent must verify the cloud's certificate: public CAs by default, or only the configured CA."""
import httpx
import pytest

from dhumal_sync.sink import HttpSink, SinkError


@pytest.fixture
def verify_used(monkeypatch):
    seen = {}
    real = httpx.Client

    def client(**kwargs):
        seen["verify"] = kwargs.get("verify")
        return real(**{k: v for k, v in kwargs.items() if k != "verify"})

    monkeypatch.setattr(httpx, "Client", client)
    return seen


def test_verifies_against_public_cas_by_default(verify_used):
    HttpSink("https://x/api/ingest", "", "k" * 32).close()
    assert verify_used["verify"] is True


def test_uses_the_configured_ca(verify_used):
    HttpSink("https://x/api/ingest", "", "k" * 32, "firewall-ca.crt").close()
    assert verify_used["verify"] == "firewall-ca.crt"


def sink_answered_by(response: httpx.Response) -> HttpSink:
    sink = HttpSink("https://x/api/ingest", "https://x/api/ingest", "k" * 32)
    sink.http = httpx.Client(transport=httpx.MockTransport(lambda request: response))
    return sink


PORTAL = httpx.Response(200, headers={"content-type": 'text/html; charset="UTF-8"', "via": "HTTPS/1.1 proxy:3128"},
                        text="<HTML>portal_url</HTML>")


@pytest.mark.parametrize("call", ["send", "heartbeat", "report"])
def test_a_firewall_login_page_is_not_success(call):
    with pytest.raises(SinkError, match="Something other than the cloud"):
        getattr(sink_answered_by(PORTAL), call)({"type": "batch"})


def test_the_clouds_answer_is_accepted():
    sink = sink_answered_by(httpx.Response(200, json={"requested": True}))
    sink.send({"type": "batch"})
    assert sink.report({"type": "poll"}) == {"requested": True}
