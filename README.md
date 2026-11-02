# Don't Forget

A clean, responsive personal web application to save, organize, and review useful links, articles, videos, and websites.

## ✨ Features

- **Save & Organize Links:** Categorize items, assign priority levels, and attach tags.
- **Review System:** Schedule review dates with smart filters for overdue, today, and upcoming reviews.
- **Favorites & Archive:** Keep top resources close at hand or archive links without losing them.
- **Random Discovery:** Serendipitously discover an unreviewed link from your library.
- **Themes:** Built-in Light and Dark themes.
- **Cloud Sync & Authentication:** Secured with Supabase Auth and PostgreSQL database with Row Level Security (RLS).
- **Import from Browser:** Non-destructive migration tool to transfer local browser data into your cloud account.

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, and JavaScript
- **Icons:** [Lucide Icons](https://lucide.dev/) (bundled locally)
- **Backend & Auth:** [Supabase](https://supabase.com/) (Auth, PostgreSQL Database, Row Level Security)

## 🚀 How to Run Locally

### Option 1: Using `start.bat` (Windows)
Double-click `start.bat` or run it from the command line:
```cmd
start.bat
```
This starts a lightweight local server at `http://localhost:8123`.

### Option 2: Using Node.js
```bash
npx http-server -p 8123 -c-1
```

### Option 3: Using Python
```bash
python -m http.server 8123
```

Then open your browser and navigate to:
```
http://localhost:8123
```

## 📁 Project Structure

```
Don't-Forget/
├── index.html              # Main application markup & modals
├── start.bat               # Windows local server launcher
├── README.md               # Project documentation
├── .gitignore              # Git ignore rules
├── assets/
│   ├── favicon.svg         # Application icon
│   ├── lucide.js           # Lucide icon library
│   └── supabase.js         # Supabase JS v2 client library
├── css/
│   └── style.css           # Complete responsive styling & themes
└── js/
    ├── app.js              # Application controller & UI logic
    ├── auth-ui.js          # Authentication screen & session gating
    ├── migrate.js          # Browser localStorage migration helper
    ├── storage.js          # Data layer & Supabase integration
    └── supabase-auth.js    # Supabase client setup & auth helpers
```

## 🔒 Security & Privacy

- All database operations are protected by **Row Level Security (RLS)** in Supabase.
- Only the frontend-safe **Publishable Key** is used in the browser.
- No sensitive credentials or secrets are stored in this repository.
