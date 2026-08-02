FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY predict-server.py .

EXPOSE 5001

# gunicorn instead of Flask's own dev server, which explicitly warns against
# production use. Shell form so $PORT expands — Render (and most PaaS hosts)
# assign this dynamically; ${PORT:-5001} keeps the plain `docker run`/
# docker-compose case (no PORT set) working the same as before.
CMD gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 60 predict-server:app
