FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY predict-server.py .

EXPOSE 5001

# gunicorn instead of Flask's own dev server, which explicitly warns against
# production use. JSON-array CMD running `sh -c exec ...`: the `exec` matters
# — without it, gunicorn runs as a child of the shell instead of replacing it
# as PID 1, so it wouldn't receive SIGTERM directly and container stops would
# always hit the slow-kill timeout instead of shutting down cleanly. $PORT is
# assigned dynamically by Render (and most PaaS hosts); ${PORT:-5001} keeps
# the plain `docker run`/docker-compose case (no PORT set) working the same
# as before.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 60 predict-server:app"]
