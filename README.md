# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app
server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

### Azure (papsummitadmin)

Every push to `main` builds the app and deploys it to the `papsummitadmin` App
Service (`.github/workflows/main_papsummitadmin.yml`). Environment variables
come from the App Service's App settings, not from `.env`.

The pipeline does not touch the database. If a commit changes
`prisma/schema.prisma`, apply the schema to production **before** pushing, or
the new code will run against the old tables:

```sh
DATABASE_URL="<production papaccreditation URL>" npx prisma db push
```

Without `--force-reset`, `db push` keeps existing data and stops with a warning
if a change would lose any (a dropped column, a new required column, a new
unique constraint over duplicate rows). Do not pass `--accept-data-loss` to get
past it. Write a data fix for the affected rows, run it, then push the schema
again.

Keep `npm start` free of tools from `node_modules/.bin` such as `cross-env`. The
workflow zips the app with `zip -r`, which copies the files those symlinks point
to instead of keeping the links, and the copied shims fail at startup on Azure.

### Local database

`docker-compose.yml` runs Postgres 16 on port 5432:

```sh
docker compose up -d
npx prisma db push
npx prisma db seed
```

Point `DATABASE_URL` in `.env` at
`postgresql://postgres:postgres@localhost:5432/accreditation`.

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already
configured for a simple default starting experience. You can use whatever css
framework you prefer. See the
[Vite docs on css](https://vitejs.dev/guide/features.html#css) for more
information.
