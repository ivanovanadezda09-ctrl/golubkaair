FROM node:24-bookworm-slim AS frontend
WORKDIR /build
RUN npm install --global pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN pnpm build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home reshis && mkdir /state && chown reshis:reshis /state
COPY backend/app ./app
COPY data/my_forecast.csv data/routes.csv ./data/
COPY --from=frontend /build/dist ./frontend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data FRONTEND_DIR=/app/frontend DATABASE_URL=sqlite:////state/reshis.sqlite3 PORT=8000
USER reshis
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\" --workers 1"]
