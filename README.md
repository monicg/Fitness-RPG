
# Fitness RPG (GitHub Pages Ready)

This version is pre-configured to deploy on **GitHub Pages** using **only the browser**.

## Browser-only GitHub steps
1. Create a new repo on GitHub (no README).
2. Click **"Add file" → "Upload files"**, then upload the **contents** of this ZIP (folders and files).
   - On iPhone/Android: tap the ZIP in your Files app to unzip, then select the files/folders to upload.
3. After upload, press **Commit changes**.
4. Go to **Settings → Pages → Build and deployment → Source = GitHub Actions**.
5. In your repo, go to **Add file → Create new file** and create: `.github/workflows/deploy.yml` with the contents shown below.
6. Commit that file. The site will build and go live at:
   - `https://<yourname>.github.io/<repo-name>/`

### GitHub Actions workflow to paste (deploy.yml)
```yaml
name: Deploy Vite to GitHub Pages
on:
  push:
    branches: [ main ]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## Local dev (optional; you don't need this for Pages)
- `npm install`
- `npm run dev`

