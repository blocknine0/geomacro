FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RISK_GATE_STATE_DB=/data/risk_gate_events.sqlite
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY core.py sources.py dispatcher.py runtime.py ./
RUN python -m compileall -q . && mkdir -p /data && chown -R 65532:65532 /data
USER 65532:65532
EXPOSE 8765
CMD ["uvicorn", "runtime:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
