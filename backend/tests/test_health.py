def test_healthcheck(api_client):
    response = api_client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
