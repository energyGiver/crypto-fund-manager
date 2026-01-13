# Vercel 배포 계획

## 배포 아키텍처 (Option 1 - 추천)

```
┌─────────────┐
│   Vercel    │ ← Frontend (Next.js)
└──────┬──────┘
       │ API calls
       ↓
┌─────────────┐
│   Railway   │ ← Backend (NestJS)
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Neon DB    │ ← PostgreSQL
└─────────────┘
```

## Phase 1: Database 마이그레이션

### 1.1 Neon DB 계정 생성
- https://neon.tech 가입
- 무료 tier: 0.5GB storage, 1개 프로젝트
- Database 생성 → Connection string 복사

### 1.2 Prisma Schema 수정

```prisma
// backend/prisma/schema.prisma
datasource db {
  provider = "postgresql"  // sqlite → postgresql
  url      = env("DATABASE_URL")
}
```

### 1.3 Migration 실행

```bash
cd backend

# Install PostgreSQL dependencies
npm install pg

# Generate new migration
npx prisma migrate dev --name postgres_migration

# Push to Neon
DATABASE_URL="postgresql://..." npx prisma db push
```

### 1.4 데이터 마이그레이션 (선택)

기존 SQLite 데이터가 있다면:
```bash
# Export from SQLite
sqlite3 prisma/dev.db .dump > export.sql

# Import to PostgreSQL (수동 변환 필요)
# SQLite → PostgreSQL syntax 차이 있음
```

---

## Phase 2: Backend 배포 (Railway)

### 2.1 Railway 설정

1. https://railway.app 가입
2. New Project → Deploy from GitHub
3. Repository 선택: `crypto-fund-manager`
4. Root directory: `/backend`

### 2.2 Build 설정

```json
// backend/package.json
{
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/main",
    "postinstall": "npx prisma generate"
  }
}
```

### 2.3 Railway 환境변수 설정

```env
# Database
DATABASE_URL=postgresql://neon_connection_string

# API Keys
ETHERSCAN_API_KEY=your_etherscan_key
COINMARKETCAP_API_KEY=your_cmc_key

# Node
NODE_ENV=production
PORT=3000
```

### 2.4 `railway.json` 생성

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start:prod",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Phase 3: Frontend 배포 (Vercel)

### 3.1 Vercel 프로젝트 생성

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

### 3.2 `vercel.json` 설정

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

### 3.3 환경변수 설정

Vercel Dashboard → Settings → Environment Variables:

```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

### 3.4 Frontend API client 수정

```typescript
// frontend/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
```

---

## Phase 4: CORS 설정

Backend에서 Vercel 도메인 허용:

```typescript
// backend/src/main.ts
app.enableCors({
  origin: [
    'http://localhost:3000',
    'https://your-frontend.vercel.app',
  ],
  credentials: true,
});
```

---

## Phase 5: CI/CD 설정

### 5.1 GitHub Actions (Backend)

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy Backend to Railway

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        run: |
          # Railway CLI deployment
          curl -fsSL https://railway.app/install.sh | sh
          railway up
```

### 5.2 Vercel (자동)

- GitHub 연동 시 자동 배포
- `main` branch push → 자동 production 배포
- PR 생성 → 자동 preview 배포

---

## 비용 산정

### 무료 Tier 사용 시

| 서비스 | 무료 제공 | 월 비용 |
|--------|-----------|---------|
| Vercel | 100GB bandwidth, Unlimited projects | $0 |
| Railway | $5 credit | $0 (초과 시 $5/월) |
| Neon DB | 0.5GB, 1 project | $0 |
| **Total** | | **$0** |

### 유료 Upgrade 시

| 서비스 | Plan | 월 비용 |
|--------|------|---------|
| Vercel | Pro | $20 |
| Railway | Pro | $20 |
| Neon DB | Pro | $20 |
| **Total** | | **$60** |

---

## 도메인 설정

### 커스텀 도메인 연결

1. **Vercel**:
   - Settings → Domains → Add Domain
   - DNS 설정: CNAME → cname.vercel-dns.com

2. **Railway**:
   - Settings → Public Networking → Custom Domain
   - DNS 설정: CNAME → your-app.railway.app

---

## 모니터링 & 로깅

### Vercel Analytics
- 자동 활성화 (무료)
- Real-time traffic 모니터링

### Railway Logs
```bash
railway logs
```

### Sentry 연동 (선택)
```bash
npm install @sentry/nextjs @sentry/node
```

---

## 보안 체크리스트

- [ ] API Keys를 환경변수로 관리
- [ ] `.env` 파일 `.gitignore`에 추가
- [ ] CORS origin 제한
- [ ] Rate limiting 추가 (선택)
- [ ] HTTPS 강제 (Vercel/Railway 자동)

---

## 배포 순서

```bash
# 1. Database 마이그레이션
cd backend
DATABASE_URL="neon_url" npx prisma db push

# 2. Backend 배포
railway up

# 3. Frontend 환경변수 설정
vercel env add NEXT_PUBLIC_API_URL

# 4. Frontend 배포
vercel --prod
```

---

## 트러블슈팅

### Backend timeout
- Railway에서 request timeout 없음
- Long-running jobs 지원

### Database connection pool
```typescript
// backend/src/prisma/prisma.service.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});
```

### Cold start 최적화
- Railway는 항상 running (sleep 없음)
- Vercel은 Edge Functions 사용 고려

---

## 다음 단계

1. [ ] Neon DB 생성 및 migration
2. [ ] Railway 프로젝트 생성
3. [ ] Backend 배포 테스트
4. [ ] Vercel 프로젝트 생성
5. [ ] Frontend 배포 테스트
6. [ ] 도메인 연결 (선택)
7. [ ] 모니터링 설정
