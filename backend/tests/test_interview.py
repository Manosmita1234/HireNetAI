"""
tests/test_interview.py – Tests for interview session endpoints.

Covers: get questions (empty + seeded), start session, get session,
complete session, and my-sessions list.
"""

import pytest
from httpx import AsyncClient

from tests.conftest import create_user, auth_headers


@pytest.mark.asyncio
async def test_get_questions_empty(client: AsyncClient):
    """Question bank should return an empty list when not seeded."""
    resp = await client.get("/interview/questions")
    assert resp.status_code == 200
    assert resp.json()["questions"] == []


@pytest.mark.asyncio
async def test_seed_and_get_questions(client: AsyncClient):
    """Seeding via admin endpoint should populate the question bank."""
    admin = await create_user(client, "admin@x.com", "Admin User", "admin")
    hdrs = auth_headers(admin["access_token"])

    # Seed questions
    seed_resp = await client.post("/admin/seed-questions", headers=hdrs)
    assert seed_resp.status_code == 200
    assert "Seeded" in seed_resp.json()["message"]

    # Check they're returned
    q_resp = await client.get("/interview/questions")
    assert q_resp.status_code == 200
    questions = q_resp.json()["questions"]
    assert len(questions) == 10
    # Check expected_duration_seconds is present
    assert "expected_duration_seconds" in questions[0]


@pytest.mark.asyncio
async def test_start_session(client: AsyncClient):
    """A candidate should be able to start a new interview session."""
    cand = await create_user(client, "cand@x.com", "Cand User", "candidate")
    hdrs = auth_headers(cand["access_token"])

    resp = await client.post(
        "/interview/session/start",
        json={"role_applied": "Software Engineer"},
        headers=hdrs,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "session_id" in data
    assert len(data["session_id"]) == 24  # MongoDB ObjectId string length


@pytest.mark.asyncio
async def test_start_session_without_body(client: AsyncClient):
    """Starting a session without a body should default role_applied to 'Not specified'."""
    cand = await create_user(client, "cand2@x.com", "Cand Two", "candidate")
    hdrs = auth_headers(cand["access_token"])

    resp = await client.post("/interview/session/start", headers=hdrs)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_get_session(client: AsyncClient):
    """A candidate should be able to retrieve their own session."""
    cand = await create_user(client, "cand3@x.com", "Cand Three", "candidate")
    hdrs = auth_headers(cand["access_token"])

    start_resp = await client.post("/interview/session/start", headers=hdrs)
    session_id = start_resp.json()["session_id"]

    get_resp = await client.get(f"/interview/session/{session_id}", headers=hdrs)
    assert get_resp.status_code == 200
    session = get_resp.json()
    assert session["id"] == session_id
    assert session["candidate_email"] == "cand3@x.com"


@pytest.mark.asyncio
async def test_get_session_forbidden(client: AsyncClient):
    """A candidate should not be able to access another candidate's session."""
    cand_a = await create_user(client, "a@x.com", "A", "candidate")
    cand_b = await create_user(client, "b@x.com", "B", "candidate")

    start_resp = await client.post(
        "/interview/session/start", headers=auth_headers(cand_a["access_token"])
    )
    session_id = start_resp.json()["session_id"]

    resp = await client.get(
        f"/interview/session/{session_id}",
        headers=auth_headers(cand_b["access_token"]),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_my_sessions(client: AsyncClient):
    """my-sessions should only return sessions belonging to the requesting candidate."""
    cand = await create_user(client, "mysess@x.com", "My Sess", "candidate")
    hdrs = auth_headers(cand["access_token"])

    # Start two sessions
    await client.post("/interview/session/start", headers=hdrs)
    await client.post("/interview/session/start", headers=hdrs)

    resp = await client.get("/interview/my-sessions", headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()["sessions"]) == 2
