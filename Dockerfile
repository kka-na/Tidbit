FROM node:20-bookworm-slim

# better-sqlite3 네이티브 빌드용 도구 (라즈베리파이/ARM 대비)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 설치 (캐시 활용)
COPY package*.json ./
RUN npm install --omit=dev

# 앱 소스 복사
COPY . .

ENV PORT=3000
ENV DB_PATH=/data/tidbit.db
EXPOSE 3000

CMD ["node", "server.js"]
