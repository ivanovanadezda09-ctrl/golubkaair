
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.sqlite'}")
    with TestClient(app, headers={"X-Reshis-Request": "1"}) as client:
        yield client


def test_real_forecasts(client):
    routes = client.get("/api/routes").json()
    dates = client.get("/api/dates").json()
    assert len(routes) == 5
    assert len(dates) == 31
    for route in routes:
        for day in (dates[0], dates[-1]):
            p = route["base_price"]
            query = dict(route=route["route"], date=day, price=p)
            f = client.post("/api/forecast", json=query).json()
            high = client.post("/api/forecast", json={**query, "price": 1_000_000}).json()
            low = client.post("/api/forecast", json={**query, "price": 0}).json()
            row = app.state.dataset.rows[route["route"], day]
            assert f["demand"] == row["0.5_base_demand"]
            assert len(f["quantiles"]) == 9
            assert f["quantiles"][4]["demand"] == f["demand"]
            assert f["demand"] < low["demand"]
            assert high["demand"] < f["demand"]
            assert high["sales"] == 0
            assert low["sales"] == low["seats"]
            assert low["demand"] > low["seats"]
            assert f["revenue"] == p * f["sales"]
            assert f["sales"] == min(f["seats"], f["demand"])
            assert high["demand"] == pytest.approx(f["demand"] - route["price_sensitivity"] * (1_000_000 - p))
            zero = client.post("/api/forecast", json={**query, "price": p + f["demand"] / route["price_sensitivity"]}).json()
            assert zero["sales"] == pytest.approx(0, abs=1e-9)


@pytest.mark.parametrize("patch,status", [
    ({"route": "AAA-BBB"}, 404), ({"date": "2026-07-02"}, 404), ({"price": -1}, 422)
])
def test_invalid_request(client, patch, status):
    query = {"route": "MOW-AER", "date": "2026-06-01", "price": 9000, **patch}
    assert client.post("/api/forecast", json=query).status_code == status


def test_render_rejects_local_database(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://example.com")
    monkeypatch.setenv("SECURE_COOKIE", "1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        with TestClient(app):
            pass


def test_credentials_validation_does_not_echo_input(client):
    response = client.post("/api/auth/register", json={
        "email": "test@example.com", "password": "short",
    })
    assert response.status_code == 422
    assert response.json() == {"detail": "Проверьте введённые данные"}


@pytest.mark.parametrize("broken", [False, True])
def test_unavailable_data(tmp_path, monkeypatch, broken):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.sqlite'}")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    if broken:
        (tmp_path / "my_forecast.csv").write_text("route,date\n")
        (tmp_path / "routes.csv").write_text("route,name\n")
    with TestClient(app) as c:
        assert c.get("/api/health").status_code == 503


def test_account_and_private_scenarios(client):
    assert client.get("/api/scenarios").status_code == 401
    credentials = {"email": "first@example.com", "password": "example-password"}
    assert client.post("/api/auth/register", json=credentials, headers={"X-Reshis-Request":"0"}).status_code == 403
    registered = client.post("/api/auth/register", json=credentials)
    assert registered.status_code == 201
    assert "httponly" in registered.headers["set-cookie"].lower()
    saved = client.post("/api/scenarios", json={
        "route": "MOW-AER", "date": "2026-06-01", "price": 9000, "title":"Проверка",
    })
    assert saved.status_code == 201
    path = f"/api/scenarios/{saved.json()['id']}"
    assert client.get(path).json()["difference"]["revenue"] == 0
    assert saved.json()["favorite"] is False
    assert client.patch(path + "/favorite", json={"favorite": True}).json()["favorite"] is True
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={**credentials, "password":"bad-password"}).status_code == 401
    assert client.post("/api/auth/register", json={**credentials, "email":"second@example.com"}).status_code == 201
    assert client.get(path).status_code == 404
    assert client.patch(path + "/favorite", json={"favorite": False}).status_code == 404
    assert client.delete(path).status_code == 404
    assert client.get("/api/scenarios").json() == []
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(path).json()["favorite"] is True
    assert client.patch(path + "/favorite", json={"favorite": False}).json()["favorite"] is False
    assert client.delete(path).status_code == 200
    assert client.get(path).status_code == 404


def test_pricing_objectives_match_notebook_and_backend(client):
    # This unrounded median comes from predictions.head() in the submitted notebook.
    raw_median = 815.549072
    query = {"route": "MOW-AER", "date": "2026-06-01", "price": 9000}
    f = client.post("/api/forecast", json=query).json()
    assert f["demand"] == round(raw_median)
    assert f["seats"] == 900
    assert (f["price_sensitivity"], f["base_price"], f["cost_per_passenger"]) == (.141, 9000, 4200)
    assert (f["price_min"], f["price_max"]) == (5400, 18000)
    ml_price = f["quantiles"][4]["recommended_price"]
    revenue_price = f["revenue_optimal_price"]
    prices = range(f["price_min"], f["price_max"] + 1)

    def sales(price, base_demand):
        return min(900, max(0, base_demand - .141 * (price - 9000)))

    assert ml_price == max(prices, key=lambda p: (p - 4200) * sales(p, raw_median)) == 9492
    assert revenue_price == max(prices, key=lambda p: p * sales(p, round(raw_median))) == 8405
    response = client.post("/api/pricing/compare", json={**query, "prices": [ml_price, revenue_price]})
    assert response.status_code == 200
    ml, optimum = response.json()
    assert ml["revenue"] == pytest.approx(7086992.976)
    assert optimum["revenue"] == pytest.approx(7563617.475)
    assert optimum["revenue"] > ml["revenue"]
    assert (ml_price - 4200) * ml["sales"] > (revenue_price - 4200) * optimum["sales"]
