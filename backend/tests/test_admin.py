"""
tests/test_admin.py – Tests for admin-only endpoints.

Covers: seed-questions idempotency, list candidates, session detail,
question bank CRUD, and session deletion.
"""

import pytest
from httpx import AsyncClient

from tests.conftest import create_user, auth_headers


async def _setup_admin(client: AsyncClient) -> dict:
    """Helper: create an admin user and return their token data."""
    return await create_user(client, "admin@test.com", "Test Admin", "admin")


async def _setup_candidate_with_session(client: AsyncClient, email: str) -> tuple[dict, str]:
    """Helper: create a candidate, start a session, return (token_data, session_id)."""
    cand = await create_user(client, email, email.split("@")[0], "candidate")
    resp = await client.post(
        "/interview/session/start",
        headers=auth_headers(cand["access_token"]),
    )
    return cand, resp.json()["session_id"]


@pytest.mark.asyncio
async def test_seed_questions_success(client: AsyncClient):
    """Admin should be able to seed the question bank."""
    admin = await _setup_admin(client)
    resp = await client.post(
        "/admin/seed-questions",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.status_code == 200
    assert "Seeded 10" in resp.json()["message"]


@pytest.mark.asyncio
async def test_seed_questions_idempotent(client: AsyncClient):
    """Seeding a second time should skip and return the count."""
    admin = await _setup_admin(client)
    hdrs = auth_headers(admin["access_token"])
    await client.post("/admin/seed-questions", headers=hdrs)
    resp2 = await client.post("/admin/seed-questions", headers=hdrs)
    assert resp2.status_code == 200
    assert "Already have" in resp2.json()["message"]


@pytest.mark.asyncio
async def test_list_candidates(client: AsyncClient):
    """Admin should see a list of all candidate sessions."""
    admin = await _setup_admin(client)
    hdrs = auth_headers(admin["access_token"])

    await _setup_candidate_with_session(client, "c1@x.com")
    await _setup_candidate_with_session(client, "c2@x.com")

    resp = await client.get("/admin/candidates", headers=hdrs)
    assert resp.status_code == 200
    candidates = resp.json()["candidates"]
    assert len(candidates) == 2


@pytest.mark.asyncio
async def test_get_session_detail(client: AsyncClient):
    """Admin should be able to retrieve full session detail."""
    admin = await _setup_admin(client)
    _, session_id = await _setup_candidate_with_session(client, "detail@x.com")

    resp = await client.get(
        f"/admin/session/{session_id}",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id


@pytest.mark.asyncio
async def test_get_session_detail_not_found(client: AsyncClient):
    """Requesting a non-existent session should return 404."""
    admin = await _setup_admin(client)
    fake_id = "000000000000000000000000"
    resp = await client.get(
        f"/admin/session/{fake_id}",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_question_bank(client: AsyncClient):
    """Admin should be able to retrieve the question bank."""
    admin = await _setup_admin(client)
    hdrs = auth_headers(admin["access_token"])
    await client.post("/admin/seed-questions", headers=hdrs)

    resp = await client.get("/admin/question-bank", headers=hdrs)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 10
    assert len(data["questions"]) == 10


@pytest.mark.asyncio
async def test_add_and_delete_question(client: AsyncClient):
    """Admin should be able to add and then delete a custom question."""
    admin = await _setup_admin(client)
    hdrs = auth_headers(admin["access_token"])

    # Add question
    add = await client.post("/admin/questions", headers=hdrs, json={
        "text": "Describe your experience with microservices.",
        "category": "technical",
        "difficulty": "hard",
        "expected_duration_seconds": 120,
    })
    assert add.status_code == 201
    q_id = add.json()["id"]

    # Delete question
    delete = await client.delete(f"/admin/questions/{q_id}", headers=hdrs)
    assert delete.status_code == 200

    # Verify question is gone
    all_q = await client.get("/admin/question-bank", headers=hdrs)
    ids = [q["id"] for q in all_q.json()["questions"]]
    assert q_id not in ids


@pytest.mark.asyncio
async def test_delete_session(client: AsyncClient):
    """Admin should be able to delete a session."""
    admin = await _setup_admin(client)
    _, session_id = await _setup_candidate_with_session(client, "del@x.com")

    resp = await client.delete(
        f"/admin/session/{session_id}",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.status_code == 200

    # Confirm it's gone
    check = await client.get(
        f"/admin/session/{session_id}",
        headers=auth_headers(admin["access_token"]),
    )
    assert check.status_code == 404
