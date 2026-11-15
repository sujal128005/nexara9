cat << 'EOF' > test_main.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_create_transaction():
    response = client.post("/transactions/", headers={"x-user-role": "admin"}, json={"amount": 1500, "type": "income", "category": "Work", "date": "2026-04-04"})
    assert response.status_code == 201

def test_viewer_forbidden():
    response = client.post("/transactions/", headers={"x-user-role": "viewer"}, json={"amount": 50, "type": "expense", "category": "Food", "date": "2026-04-04"})
    assert response.status_code == 403
EOF
