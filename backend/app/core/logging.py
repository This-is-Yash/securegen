import logging
import sys
from app.core.config import settings


def setup_logging():
    log_level = logging.DEBUG if settings.debug else logging.INFO
    log_format = "[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s"

    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

    # Silence overly verbose external loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


logger = logging.getLogger("secure_coding_backend")
