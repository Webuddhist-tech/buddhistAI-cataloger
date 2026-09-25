from sqlalchemy.orm.session import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from core.config import DATABASE_URL
import os

# PERFORMANCE FIX: Disable SQL echo in production to reduce logging overhead
# Set SQLALCHEMY_ECHO=true in .env for development debugging
SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"

engine = create_engine(
    DATABASE_URL,
    echo=SQLALCHEMY_ECHO,  # Only log SQL in development
    pool_pre_ping=True,  # Verify connections before using
    pool_size=10,  # Connection pool size
    max_overflow=20,  # Max overflow connections
    # Fail fast when the DB is unreachable instead of hanging request threads forever
    connect_args={"connect_timeout": 10},
)
SessionLocal = sessionmaker[Session](
    bind=engine,
    autoflush=False,
    autocommit=False
)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()  # 🔴 REQUIRED
