# Submission Checklist — INE Software Engineer Intern Assignment

> Tick every box before sending the email.

---

## App & Deployment

- [ ] **Live frontend works end-to-end**
  - [ ] Search returns products from the mock store
  - [ ] "Track" button adds a product to the dashboard
  - [ ] Price chart updates after triggering a cron scrape
  - [ ] Stock badge and ₹ price shown correctly (not $)
  - [ ] Replace `<LIVE_FRONTEND_URL>` placeholder in `README.md` with actual Vercel URL

- [ ] **Backend health check passes**
  - URL: `https://price-tracker-backend-5re1.onrender.com/health`
  - Expected: `{ "status": "ok" }`

- [ ] **Cron scrape works on Render**
  - Trigger: `POST /api/cron/scrape` with `X-Cron-Token` header
  - Verify: active products get fresh `price_history` rows after ~60 s

---

## Repository

- [ ] GitHub repo is **public**: `https://github.com/Shivansh3127/price-tracker`
- [ ] No `.env` file committed — only `.env.example` files (`git ls-files | grep .env` returns only `.env.example` / `.env.production.example`)
- [ ] All source files present (frontend `src/`, backend `src/`, `supabase/migrations/`)
- [ ] `README.md` is complete — no placeholder commands or "fill in later" text remaining
- [ ] `DESIGN_NOTE.md` is filled in with real, specific detail — no templated language

---

## Demo Recording (2–4 min)

- [ ] Screen recording created (OBS or Windows Game Bar `Win + G`)
- [ ] Recording shows:
  - [ ] `cd backend && npm run scrape:headed` — visible Chromium window opens
  - [ ] Browser navigates to listing page (cookie consent), then to PDP
  - [ ] Zigzag mouse movement triggers price reveal
  - [ ] Console prints ✅ price + stock status
  - [ ] At least one slow/delayed response visible (network latency or retry)
- [ ] Recording file attached or linked in email (Google Drive / WeTransfer / direct attach)

---

## Email

- [ ] **To:** `sstephen@ine.com`
- [ ] **CC:** `ssingh@ine.com`
- [ ] **Subject:** `First Round: Software Engineer Intern Assignment - <Your Full Name>`
- [ ] **Body includes:**
  - [ ] Live site link (Vercel URL)
  - [ ] GitHub repo link
  - [ ] Brief one-paragraph description of what you built and the key challenge solved
- [ ] **Attachments:**
  - [ ] PDF resume
  - [ ] Screen recording (or link to it)
- [ ] **Sent before:** Sept 20, 11:59 PM IST

---

## Final Sanity Check (30 seconds)

```bash
# 1. Confirm no secrets committed
git ls-files | grep "\.env$"   # should print nothing

# 2. Confirm latest code is pushed
git log --oneline -3

# 3. Wake Render and hit health
curl https://price-tracker-backend-5re1.onrender.com/health
```
