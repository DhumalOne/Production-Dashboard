"""The Service Layer client must never send anything that could change SAP data.

These tests use a mock transport, so nothing reaches SAP. Any request that gets past the
guard is recorded; the write tests assert that list stays empty.
"""
import httpx
import pytest

from dhumal_sync.config import SapConfig
from dhumal_sync.sl import ReadOnlyViolation, ServiceLayer

CFG = SapConfig(base_url="https://sap.test/b1s/v2/", user="u", password="p", companies=["C"])


@pytest.fixture
def client():
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={"value": []})

    sl = ServiceLayer(CFG, "C")
    sl.http._transport = httpx.MockTransport(handler)
    return sl, sent


@pytest.mark.parametrize("method", ["PATCH", "PUT", "DELETE", "MERGE"])
def test_write_methods_are_blocked_before_sending(client, method):
    sl, sent = client
    with pytest.raises(ReadOnlyViolation):
        sl.http.request(method, "Items('A1')", json={"ItemName": "x"})
    assert sent == []


@pytest.mark.parametrize("path", [
    "Invoices",                       # create a document
    "Invoices(1)/Cancel",             # document action
    "Items('A1')",                    # update via POST
    "$batch",                         # batch could hide writes
    "SQLQueries",                     # create a saved query
    "Login/../Invoices",              # path tricks
    "Login?x=1",                      # Login with a query string
    "CompanyService_UpdateAdminInfo", # service call
])
def test_posts_other_than_login_logout_are_blocked(client, path):
    sl, sent = client
    with pytest.raises(ReadOnlyViolation):
        sl.http.post(path, json={})
    assert sent == []


def test_writes_through_internal_send_are_blocked(client):
    sl, sent = client
    with pytest.raises(ReadOnlyViolation):
        sl._send("PATCH", "BusinessPartners('C1')", json={"Phone1": "x"})
    assert sent == []


@pytest.mark.parametrize("link,expected", [
    ("Invoices?$skip=20", "Invoices?$skip=20"),
    ("b1s/v2/$crossjoin(A,A/L)?$skip=500", "$crossjoin(A,A/L)?$skip=500"),
    ("/b1s/v2/$crossjoin(A,A/L)?$skip=500", "$crossjoin(A,A/L)?$skip=500"),
    ("https://sap.test/b1s/v2/Items?$skip=20", "Items?$skip=20"),
])
def test_next_links_are_normalised(client, link, expected):
    sl, _ = client
    assert sl._next_path(link) == expected


def test_reads_and_session_calls_are_allowed(client):
    sl, sent = client
    sl.http.post("Login", json={})
    sl.get("Invoices", {"$top": "1"})
    sl.http.post("Logout")
    assert [r.method for r in sent] == ["POST", "GET", "POST"]
