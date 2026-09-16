FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
COPY final_validation/ ./final_validation/

# Nifty500 BMS V1 production artifacts
COPY nifty500_bms_v1_results.csv ./
COPY nifty500_bms_v1_product_view_final.csv ./
COPY nifty500_bms_v1_candidate.db ./

RUN pip install --no-cache-dir .

ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV BMS_TCS_FILE=/app/final_validation/tcs_events.csv

EXPOSE 8080

CMD ["sh", "-c", "uvicorn stock_intelligence.bms_api:app --host 0.0.0.0 --port ${PORT}"]
