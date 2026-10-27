"""Read-only SAP Business One Service Layer client.

READ-ONLY GUARANTEE: every request passes through `_read_only_guard` before it leaves this
machine. Only GET, and POST to Login/Logout, are allowed; anything else raises
ReadOnlyViolation and is never sent. This holds even if the configured SAP user could write.

Also handles session expiry, Service Layer hiccups (502/503/504, dropped connections) and
OData paging.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Iterator

import httpx

from .config import SapConfig

log = logging.getLogger(__name__)

RETRY_STATUS = {502, 503, 504}
BACKOFF_SECONDS = (2, 5, 15, 30, 60)


SESSION_ENDPOINTS = ("Login", "Logout")


class ServiceLayerError(RuntimeError):
    pass


class ReadOnlyViolation(RuntimeError):
    """Raised before sending any request that could change data in SAP."""


def _read_only_guard(request: httpx.Request) -> None:
    if request.method == "GET":
        return
    endpoint = request.url.path.rstrip("/").rsplit("/", 1)[-1]
    if request.method == "POST" and endpoint in SESSION_ENDPOINTS and not request.url.query:
        return
    raise ReadOnlyViolation(f"Blocked {request.method} {request.url.path}: this client is read-only")


class ServiceLayer:
    def __init__(self, cfg: SapConfig, company: str):
        self.cfg = cfg
        self.company = company
        self.http = httpx.Client(
            base_url=cfg.base_url,
            verify=cfg.ca_file or True,
            timeout=httpx.Timeout(120, connect=15),
            event_hooks={"request": [_read_only_guard]},
        )
        self.logged_in = False

    # -- session -------------------------------------------------------------

    def login(self) -> None:
        self.http.cookies.clear()
        body = {"CompanyDB": self.company, "UserName": self.cfg.user, "Password": self.cfg.password}
        r = self._send("POST", "Login", json=body, relogin=False)
        if r.status_code != 200:
            raise ServiceLayerError(f"Login failed: HTTP {r.status_code} {_error_text(r)}")
        self.logged_in = True

    def close(self) -> None:
        if self.logged_in:
            try:
                self.http.post("Logout")
            except httpx.HTTPError:
                pass
        self.http.close()

    def __enter__(self) -> "ServiceLayer":
        self.login()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # -- requests ------------------------------------------------------------

    def _send(self, method: str, url: str, relogin: bool = True, **kw) -> httpx.Response:
        """Sends with retries on transient failures; logs in again once if the session expired."""
        for attempt, wait in enumerate((0, *BACKOFF_SECONDS)):
            if wait:
                log.warning("Service Layer retry %d in %ss: %s %s", attempt, wait, method, url[:120])
                time.sleep(wait)
            try:
                r = self.http.request(method, url, **kw)
            except httpx.TransportError as e:
                log.warning("Service Layer transport error: %r", e)
                # A dropped connection usually means the worker restarted and the session is gone.
                if relogin:
                    self._try_relogin()
                continue
            if r.status_code in RETRY_STATUS:
                continue
            if r.status_code == 401 and relogin:
                self._try_relogin()
                relogin = False  # only once per request
                continue
            return r
        raise ServiceLayerError(f"{method} {url[:120]} failed after {len(BACKOFF_SECONDS)} retries")

    def _try_relogin(self) -> None:
        try:
            self.login()
        except (ServiceLayerError, httpx.HTTPError) as e:
            log.warning("Re-login failed: %s", e)

    def get(self, path: str, params: dict | None = None, page_size: int | None = None) -> dict:
        headers = {"Prefer": f"odata.maxpagesize={page_size or self.cfg.page_size}"}
        r = self._send("GET", path, params=params, headers=headers)
        if r.status_code != 200:
            raise ServiceLayerError(f"GET {path} -> HTTP {r.status_code}: {_error_text(r)}")
        return r.json()

    def pages(self, path: str, params: dict | None = None, page_size: int | None = None) -> Iterator[list[dict]]:
        """Yields one page of records at a time, following @odata.nextLink."""
        data = self.get(path, params, page_size)
        while True:
            yield data.get("value", [])
            nxt = data.get("@odata.nextLink")
            if not nxt:
                return
            if self.cfg.page_delay_ms:
                time.sleep(self.cfg.page_delay_ms / 1000)
            data = self.get(self._next_path(nxt), page_size=page_size)

    def _next_path(self, link: str) -> str:
        """nextLink is usually relative to the base URL ("Invoices?$skip=20"), but for $crossjoin the
        Service Layer returns it with the service path ("b1s/v2/$crossjoin(...)") or as an absolute URL."""
        base_path = httpx.URL(self.cfg.base_url).path  # e.g. /b1s/v2/
        if link.startswith(("http://", "https://")):
            link = httpx.URL(link).raw_path.decode()
        stripped = "/" + link.lstrip("/")
        return stripped[len(base_path):] if stripped.startswith(base_path) else link

    def count(self, path: str, flt: str | None = None) -> int:
        r = self._send("GET", f"{path}/$count", params={"$filter": flt} if flt else None)
        if r.status_code != 200:
            raise ServiceLayerError(f"COUNT {path} -> HTTP {r.status_code}: {_error_text(r)}")
        return int(r.text.strip())


def _error_text(r: httpx.Response) -> str:
    try:
        msg = r.json().get("error", {}).get("message", "")
        return msg.get("value", msg) if isinstance(msg, dict) else str(msg)
    except ValueError:
        return r.text[:200]
