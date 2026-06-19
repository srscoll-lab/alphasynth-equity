FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY local-packages/ ./local-packages/

# Install all deps (tsx is a devDep needed to run server.ts)
RUN npm ci

COPY . .

# Build the React/Vite frontend
RUN npm run build

# Copy landing-page static assets into dist/ so express.static serves them directly
RUN cp sample-report.png dist/

ENV NODE_ENV=production
# Cloud Run injects PORT=8080; server falls back to 3005 locally
EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
