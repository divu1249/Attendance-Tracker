================================================================================
SECTION 1: README.md (Copy and paste into your project's README.md)
================================================================================

<div align="center">
  <img src="public/logo.png" alt="ShouldISkip Logo" width="100" height="100" />
  <h1>ShouldISkip</h1>
  <p><strong>Intelligent Attendance Margin Tracker & Dynamic Timetable Studio</strong></p>

  <p>
    <a href="https://shouldiskip.vercel.app"><img src="https://img.shields.io/badge/Live_Demo-shouldiskip.vercel.app-2563eb?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
    <img src="https://img.shields.io/badge/Next.js_14-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License" />
  </p>
</div>

---

## 📌 Overview

**ShouldISkip** is a cloud-native, open-source attendance intelligence engine designed for university students navigating rigid institutional attendance mandates (such as a strict 75% threshold).

Most standard trackers fail in real-world scenarios: they don't normalize multi-hour practical lab blocks, can't handle mid-semester timetable updates without corrupting past ledgers, and offer zero touch optimization on mobile browsers. **ShouldISkip** solves these with an interactive timetable matrix, mathematical recovery models, and automated serverless alerts.

---

## ✨ Key Features

- **🧮 Smart Bunk & Recovery Margins:**
  - Real-time percentage tracking against your college threshold.
  - Dynamically calculates **Safe Bunks** ($M = \lfloor\frac{100A - TP}{T}\rfloor$) or **Consecutive Recovery Classes** required ($R = \lceil\frac{TP - 100A}{100 - T}\rceil$).
- **🗓️ Schedule Studio & Atomic Slot Normalization:**
  - Drag-and-drop or tap-to-place editor built for both desktop and touch mobile devices.
  - Automatically merges contiguous lecture blocks (e.g., 2-hour labs) into unified tracking units while maintaining underlying atomic slot integrity.
  - Supports schedule revisions w.e.f. (with effect from) without altering historical attendance records.
- **🏝️ Campus Holiday Overrides:** Mark sudden holidays with one tap; suspended dates are isolated and exempted from penalty calculations.
- **⏰ Serverless Edge Alerts:** Automated Vercel Edge Crons audit user margins and dispatch early warning notifications via Resend when margins drop into critical zones.
- **🔒 Multi-Tenant Data Isolation:** Enforced via PostgreSQL Row-Level Security (RLS) on Supabase.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend & Database:** Supabase (PostgreSQL, Auth, Row-Level Security)
- **Email Infrastructure:** Resend API
- **Deployment & Automation:** Vercel (Edge Functions, Serverless Cron Jobs)

---

## 🚀 Local Development Setup

### 1. Clone the repository
```bash
git clone [https://github.com/divu1249/Attendance-Tracker.git](https://github.com/divu1249/Attendance-Tracker.git)
cd Attendance-Tracker
2. Install dependencies
Bash
npm install
# or
pnpm install / yarn install
3. Configure Environment Variables
Create a .env.local file in the project root:

Code snippet
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
CRON_SECRET=your_cron_bearer_token
4. Run database migrations
Execute the schema definitions provided in supabase/schema.sql inside your Supabase SQL Editor.

5. Run the dev server
Bash
npm run dev
Open http://localhost:3000 in your browser.

🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

Fork the Project

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'feat: add some amazing feature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request
