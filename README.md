# Control Space - Basque Country Dashboard

Self-storage site selection analysis dashboard for Euskadi (Basque Country), Spain.

Built with Next.js 14, Tailwind CSS, react-leaflet, and @tanstack/react-table.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Process data

Reads raw data from `data/es/` and outputs optimized files to `public/data/`:

```bash
node scripts/prepare-data.js
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Vercel

```bash
npx vercel
```

Or connect the GitHub repo to Vercel for automatic deployments.

## Data Sources

- **Demographics**: INE Padrón (population, age structure)
- **Income**: EUSTAT (average income by municipality)
- **Housing**: EUSTAT Census 2021 (tenure, dwelling types)
- **Prices**: Basque Government ECVI 2025 Q4 (purchase prices)
- **Rent**: Basque Government EMAL 2016-2025 (residential rents)
- **Boundaries**: Eurostat LAU 2024 (municipality polygons)

## Features

- Choropleth map with 10 metrics at 3 geographic levels (Municipio, Provincia, Euskadi)
- Click-to-select comparison of up to 4 areas
- Sortable, paginated ranking table
- Numeric filters (population, income, price, rent)
- Type-ahead search
