from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Docker болон local орчинд ажиллах өгөгдлийн сангийн хаяг
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:password1234@127.0.0.1:5433/inventory_db"
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_pre_ping=True,  # Холболт амьд эсэхийг шалгана (connection drop-оос сэргийлнэ)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Баазтай харилцах функц
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()