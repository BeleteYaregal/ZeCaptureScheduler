# CaptureSheet

Schedule a videographer to capture your company's sales team. Built for phones first: it opens like a mobile app, installs to the home screen, and works on a desktop too.

**Stack:** TypeScript, Node.js + Express + Sequelize (backend), Next.js 16 with React 19 (frontend). SQLite by default, PostgreSQL or MySQL through `DATABASE_URL`.

## Who can sign in

Only three kinds of accounts exist:

| Role | What they do |
|---|---|
| **Marketing manager** | Builds the teams, registers every salesperson and videographer, plans each week, publishes, adjusts, sees insights. |
| **Videographer** | Sees the days assigned to them, grouped **By time** or **By team** (sales manager, then supervisor). Marks captures done or missed. |
| **Salesperson** | Sees their own next capture, the week, and can add days off. Registered by the marketing manager only. |

**Sales managers and supervisors are not accounts.** They are team groups the marketing manager creates:

```
Sales manager  ->  Supervisor  ->  Salespeople (up to 12 per supervisor, changeable)
```

Everything requires sign-in. Only the marketing manager can register people.

## What's new in this version

- **Video editing tracking.** After the videographer ticks a capture **Done**, a *Mark video edited* button appears. The videographer also has an **Editing** tab: a to-do list of captured videos still waiting to be edited, with one-tap *Mark edited* (and Undo). The salesperson gets an alert when their video is edited. Insights shows the editing backlog.
- **Reports (admin).** *More > Reports and export*: filter by date range (this week, last week, this month, last 30/90 days, or custom), sales manager, supervisor, capture status, editing status and name. See totals and a table, then download a styled **Excel (.xlsx)** or **CSV** file.
- **Dynamic branding (admin).** *More > Branding*: change the app name, upload a logo and pick the brand color. It updates the sign-in screen, top bar, side rail, browser tab title and the installed-app name for everyone.
- **Day / Night mode.** Sun/moon button on every screen (and on the sign-in page); *More > Appearance* has Day, Night or Auto (follows the phone). The choice is remembered on each device.
- **Alert pop-ups.** Unread alerts pop up right after sign-in, and again whenever a new one arrives while the app is open (checked every 30 seconds and when you return to the tab).
- **Centered sign-in screen** that shows your logo and name.
- **Backup (admin).** *More > Download backup* gives a consistent copy of the whole database (SQLite).
- The marketing manager is alerted when the videographer marks a capture as missed.

## Run it

Needs Node.js 20 or newer.

```bash
npm run setup        # installs root, backend and frontend dependencies
npm run seed:demo    # optional: 2 managers, 2 supervisors, 24 salespeople, 3 weeks of history
npm run dev          # API on :4000, web app on :3000
```

Open http://localhost:3000. On a phone on the same Wi-Fi, open `http://<your-computer-ip>:3000`.

**Sign-ins**

| Account | Username | Password |
|---|---|---|
| Admin | `admin` | `admin1234` |
| Videographer (demo) | `video1` | `demo1234` |
| Salesperson (demo) | `sales01` to `sales24` | `demo1234` |

Without `seed:demo`, the first start creates only the marketing manager. Then build the teams yourself in the **Team** tab. Change the marketing manager password under **More > Change password**.

`npm run seed` creates the same people without the demo weeks. Both **reset the database**, so never run them on live data.

## How a week works

1. **Team tab.** Add sales managers, add supervisors under them, then register salespeople (username + password you hand over).
2. **Planner tab.** Choose which days of the week are used and mark each **Sales** or **Company**. Defaults are 4 sales days and 2 company days. Pick the videographer.
3. **Build the schedule.** The app spreads everyone across the sales days.
4. **Review.** Tap a person to move them to another day, swap with someone, change their time, or remove them. Add people who did not fit.
5. **Publish.** Salespeople and the videographer are notified and can see it.
6. **On the day.** The videographer (or admin) marks each capture done or missed. A missed capture can be rebooked on the next free sales day with one tap.

Cancelling a day rebooks everyone on it into other days that have room; anyone who cannot be rebooked is told a new date will follow.

## Everything is a setting (More > Settings)

Sales days per week, company days per week, salespeople per supervisor, people per sales day (or automatic), minutes per person, first capture time, and the overdue threshold. Changing a setting affects weeks you plan from then on; published weeks keep their schedule. The planner can also override the day limits for a single week.

## How the scheduling balances people

1. **Fairness.** People captured longest ago (or never) are placed first. If a week has fewer slots than people, the ones who wait go first next week.
2. **Spread.** Each supervisor's team, and each manager's group, is spread evenly across the days, so one team is not captured all on the same day.
3. **Balance.** Days are filled evenly. With no per-day limit set, the limit is `ceil(people / sales days)`.
4. **Availability.** Nobody is booked on a day they marked off. If that leaves someone with no place, the app swaps others around to make room, and tells you who still did not fit and why.

Within a day, neighbours alternate between teams. Building twice gives the same result and never creates duplicates.

## Project layout

```
backend/src
  scheduler.ts        the balancing algorithm (pure, no database)
  services/weeks.ts   planning, building, publishing, moving, rebooking
  routes/             REST API
  models.ts           Sequelize models (users, managers, supervisors, weeks, capture_days, bookings, ...)
  seed.ts             demo data
  tests/              unit + API tests
frontend/app          screens: Schedule, Planner, Team, Insights, More, Settings, Alerts, Activity log, Days off
frontend/components   day sheet, shared UI
```

## Tests

```bash
npm test      # 35 tests: algorithm edge cases and the full API (roles, limits, publishing, rebooking)
```

## Going live

- Set `JWT_SECRET` (the API refuses to start in production without it) and `ADMIN_PASSWORD` for the first run. See `backend/.env.example`.
- Build and start: `npm run build` then `npm start`. Put both behind HTTPS (a reverse proxy such as Nginx or Caddy).
- The browser only talks to the Next.js server, which forwards `/api/*` to the backend. If the backend is not on the same machine, set `API_URL` for the frontend (see `frontend/.env.local`).
- Set `NEXT_PUBLIC_DEMO_LOGINS=false` in `frontend/.env.local` before building, to hide the demo sign-in buttons.
- Back up `backend/data/scheduler.sqlite`, or point `DATABASE_URL` at PostgreSQL or MySQL.
- Add to home screen on a phone to use it like an app.

## Known limits

- Notifications are **in-app** (the bell). To also send SMS, Telegram or email, add the call in `notify()` in `backend/src/services/log.ts`: every message already goes through that one function.
- Moving people uses tap actions (move, swap, earlier, later), not drag and drop, which is more reliable on phones.
- English interface and Gregorian dates only.
- PostgreSQL and MySQL are supported through Sequelize but were not tested here; SQLite is what the tests and demo ran on.
- The login limiter is in memory, so it resets when the API restarts.
